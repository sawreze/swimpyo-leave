# 쉼표 ❜❜

연차 관리 웹앱. 입사일만 넣으면 연차가 알아서 쌓이고, 직원은 신청하고 관리자는 승인한다.

라이브러리 없이 `index.html` 한 파일로 돌아간다. 빌드 없이 더블클릭하면 바로 열림.

## 기능

**직원**
- 연차 / 오전 반차 / 오후 반차 신청 (상사에게 메시지 같이 보낼 수 있음)
- 남은 연차를 25칸짜리 판으로 보여줌
- 다음 연차가 언제 몇 개 생기는지, 25개 넘어서 사라질 게 있는지 알려줌

**관리자**
- 요청함에서 승인 / 반려 (반려 사유 적을 수 있음)
- 달력에 "오후 임해인" 이런 식으로 누가 언제 쉬는지 표시
- 연도별·부서별 집계, CSV 내려받기
- 직원 등록, 기존 잔여 연차 입력

**그 외 잡다한 것**
- 오른쪽 위에 시계랑 서울 날씨 (낮엔 해, 밤엔 달)
- 저녁 8시 ~ 아침 6시는 밤 모드. 톱니바퀴 눌러서 낮/밤 직접 고를 수도 있음
- 낮엔 구름이 천천히 흘러가고 밤엔 별똥별이 떨어짐 😎

## 연차 규칙

| 언제 | 몇 개 |
| --- | --- |
| 입사 1 ~ 11개월 | 매달 1개 |
| 입사 1년, 2년 | 15개 |
| 입사 3년, 4년 | 16개 |
| 그 뒤로 2년마다 | 1개씩 늘어남 |
| 입사 21년부터 | 매년 25개 |

- 잔여는 **최대 25개**까지만 쌓인다. 넘치는 건 소멸로 기록됨
- 발생일은 입사일과 같은 날짜. 그 달에 그 날짜가 없으면 (예: 1월 31일 입사 → 2월) 말일
- 승인된 연차는 시작일에 빠진다. 승인 대기 중인 건 "지금 쓸 수 있는 개수"에서만 빼둠

규칙 계산은 `index.html` 안의 `<script id="engine">`에 있고, 테스트는 이걸로 돌린다.

```bash
npm test
```

## 로컬에서 돌려보기

그냥 `index.html` 더블클릭. 이 경우엔 **PC 테스트 모드**로 열리고 데이터는 그 브라우저에만 저장된다.

맨 위 검은 줄에서

- **보는 사람** — 관리자 화면 ↔ 직원 화면 전환
- **기준일** — 날짜를 바꿔서 연차가 제대로 생기는지 확인할 때 씀
- **데이터 초기화** — 처음 상태로

처음 열면 "샘플 데이터로 둘러보기"가 있어서 바로 구경할 수 있다.

Supabase까지 붙여서 테스트하고 싶으면 `config.example.js`를 `config.js`로 복사하고 값 채우면 됨. (`config.js`는 gitignore 되어 있음)

## 배포 (Supabase + Netlify)

> ⚠️ 키는 절대 저장소에 올리지 말 것. 전부 Netlify 환경 변수로만 넣는다.

### Supabase

1. 프로젝트 만들고 **SQL Editor**에서 `supabase/schema.sql` 통째로 실행 (여러 번 돌려도 괜찮음)
2. **Authentication > Sign In / Providers > Email** 에서 **Confirm email 켜져 있는지 꼭 확인**
   - 직원 계정을 "확인된 이메일"로 연결하는 구조라서, 이거 꺼져 있으면 남의 이메일로 가입해서 그 사람 연차를 볼 수 있다
3. **Authentication > Emails > SMTP Settings** 에서 메일 서비스 연결
   - 기본 메일은 팀원 주소로만, 시간당 2통밖에 안 가서 직원 가입 메일이 안 감

### Netlify

1. **Add new project > Import an existing project** 에서 이 저장소 선택. 빌드 설정은 `netlify.toml`에 다 있음
2. **Project configuration > Environment variables** 에 추가 (값은 Supabase **Project Settings > API**)

   | 이름 | 값 |
   | --- | --- |
   | `SUPABASE_URL` | `https://프로젝트.supabase.co` |
   | `SUPABASE_ANON_KEY` | anon 또는 publishable 키 |

3. 다시 배포

빌드할 때 Netlify 비밀값 검사가 anon 키를 잡아서 실패하는 경우가 있다. 그러면 `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`에 anon 키 값을 넣고 다시 배포. 두 변수에 "Contains secret values"는 켜면 안 됨 (브라우저로 나가는 공개 키라 켜면 빌드가 깨짐).

### 첫 관리자 만들기

1. Supabase **Authentication > URL Configuration** 의 Site URL, Redirect URLs에 Netlify 주소 넣기
2. 사이트에서 관리자 이메일로 가입 → 메일 확인
3. SQL Editor에서

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = '관리자@회사.com';
   ```

4. 다시 로그인하면 관리자 화면. **직원** 메뉴에서 직원을 이메일이랑 같이 등록하고, 직원은 그 이메일로 가입하면 끝

## 보안 메모

- 브라우저에는 anon / publishable 키만 간다. 데이터는 Supabase RLS로 막아둠
- `service_role`이나 `sb_secret` 키가 환경 변수에 들어가 있으면 빌드가 일부러 멈추게 해놨다
- 직원은 자기 정보랑 자기 신청만 볼 수 있고, 달력에서는 다른 사람의 승인된 일정(이름, 부서, 종류, 날짜)만 보임. 메시지랑 반려 사유는 본인과 관리자만
- 관리자 추가는 SQL Editor에서만 가능

## 아직 아쉬운 점 / TODO

- [ ] 공휴일 자동 제외 — 지금은 신청할 때 개수를 직접 줄여야 함
- [ ] 잔여 부족, 날짜 겹침 검사가 화면에서만 됨. API 직접 때리면 잔여보다 많이 신청은 가능 (승인은 관리자만 할 수 있고 승인할 때 다시 검사하긴 함)
- [ ] 날씨 위치가 서울 고정

## 파일 구조

```
index.html            앱 전체 (화면 + 연차 계산 + Supabase 연동)
supabase/schema.sql   테이블, RLS 정책
scripts/build.mjs     Netlify 빌드 (config.js, 보안 헤더 생성)
tests/                연차 규칙 테스트
config.example.js     로컬에서 Supabase 붙일 때 쓰는 설정 예시
```
