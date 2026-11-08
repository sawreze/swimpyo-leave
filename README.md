# 쉼표: 연차 관리

직원은 연차와 오전·오후 반차를 신청하고, 관리자는 승인·반려와 집계를 확인하는 웹앱입니다. 별도 라이브러리 없이 `index.html` 하나로 동작합니다.

## PC에서 바로 테스트

`index.html`을 더블클릭합니다. 설치나 설정은 필요 없고, 데이터는 그 브라우저에만 저장됩니다.

상단 테스트 막대에서 할 수 있는 일:

- **보는 사람**: 관리자와 각 직원 화면을 오갑니다.
- **기준일**: 날짜를 바꿔 연차 발생을 확인합니다. 예를 들어 입사일 다음 달 같은 날짜로 옮기면 1개가 생깁니다.
- **데이터 초기화**: 처음 상태로 돌아갑니다.

## 연차 규칙

| 시점 | 발생 |
| --- | --- |
| 입사 1 ~ 11개월 | 매월 1개 |
| 입사 1년, 2년 | 15개 |
| 입사 3년, 4년 | 16개 |
| 이후 2년마다 | 1개씩 추가 |
| 입사 21년 이후 | 매년 25개 |

- 잔여 연차는 최대 25개이며, 넘는 만큼은 소멸로 기록합니다.
- 발생일은 입사일과 같은 날짜입니다. 그 달에 같은 날짜가 없으면 말일입니다.
- 승인된 연차는 시작일에 차감합니다. 승인 대기 중인 신청은 잔여에서 빼지 않고 "쓸 수 있는 개수"에서만 뺍니다.
- 규칙 코드는 `index.html`의 `<script id="engine">`에 있고, 테스트는 `npm test`로 실행합니다.

## 운영 배포

순서대로 진행합니다. 비밀값은 저장소에 넣지 않습니다.

### 1. GitHub

```bash
git init -b main
git add .
git commit -m "쉼표 연차 관리"
gh repo create swimpyo-leave --private --source=. --push
```

### 2. Supabase

1. 새 프로젝트를 만듭니다.
2. **SQL Editor**에서 `supabase/schema.sql` 전체를 실행합니다.
3. **Authentication > Sign In / Providers > Email**에서 **Confirm email이 켜져 있는지** 확인합니다. 직원 계정을 확인된 이메일로 연결하므로, 꺼져 있으면 다른 사람의 이메일로 가입해 그 직원의 데이터를 볼 수 있습니다.
4. **Authentication > Emails > SMTP Settings**에서 메일 서비스를 연결합니다. 기본 메일은 프로젝트 팀원 주소로만, 시간당 2통까지 보내므로 직원 가입 메일이 도착하지 않습니다.

### 3. Netlify

1. **Add new project > Import an existing project**에서 GitHub 저장소를 고릅니다. 빌드 설정은 `netlify.toml`에 들어 있습니다.
2. **Project configuration > Environment variables**에 추가합니다. 값은 Supabase의 **Project Settings > API**에 있습니다.

   | 이름 | 값 |
   | --- | --- |
   | `SUPABASE_URL` | `https://프로젝트.supabase.co` |
   | `SUPABASE_ANON_KEY` | anon 또는 publishable 키 |

3. 다시 배포합니다.

Netlify의 비밀값 검사가 이 키를 잡아 빌드가 실패하면, `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` 환경 변수에 anon 키 값을 넣고 다시 배포합니다. 두 변수에 "Contains secret values"는 켜지 마세요. 이 키는 브라우저로 전달되는 공개용 키이므로 켜면 빌드가 실패합니다.

### 4. 주소 연결과 첫 관리자

1. Supabase **Authentication > URL Configuration**의 **Site URL**과 **Redirect URLs**에 Netlify 주소를 넣습니다.
2. 사이트에서 관리자 이메일로 가입하고 메일 확인까지 마칩니다.
3. Supabase **SQL Editor**에서 실행합니다.

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = '관리자@회사.com';
   ```

4. 다시 로그인하면 관리자 화면이 열립니다. **직원** 메뉴에서 직원을 이메일과 함께 등록하고, 직원은 같은 이메일로 가입합니다.

## 키와 보안

- 브라우저에는 anon 또는 publishable 키만 전달합니다. 데이터는 Supabase의 행 수준 보안으로 보호합니다.
- `service_role` 또는 `sb_secret` 키가 환경 변수에 들어오면 빌드가 멈춥니다. 어디에도 넣지 마세요.
- `config.js`와 `.env`는 `.gitignore`에 들어 있습니다.
- 직원은 자기 정보와 신청만 조회하고, 달력에서는 다른 직원의 승인된 일정(이름, 부서, 종류, 날짜)만 봅니다. 메시지와 반려 사유는 본인과 관리자만 봅니다.
- 관리자 추가는 SQL Editor에서만 할 수 있습니다.

## 알아 둘 점

- 잔여 부족과 날짜 겹침은 화면에서 검사합니다. 직원이 API를 직접 호출해 잔여보다 많이 신청할 수는 있지만, 승인은 관리자만 할 수 있고 승인할 때 다시 검사합니다.
- 공휴일은 자동으로 빼지 않습니다. 신청할 때 사용 개수를 줄이면 됩니다.

## PC에서 Supabase까지 테스트

`config.example.js`를 `config.js`로 복사해 값을 넣고 `index.html`을 엽니다. `config.js`는 Git에 올라가지 않습니다.
