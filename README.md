<h1 align="center">CapCut Automation</h1>

<p align="center">
  <strong>긴 영상에서 쇼츠 후보를 찾고, 자막을 담은 CapCut 프로젝트를 만듭니다.</strong>
</p>

영상과 전사본을 입력하면 AI가 쇼츠 구간과 문구를 제안합니다. 후보를 검토한 뒤 제목, 채널 프로필, 대사 자막을 담은 CapCut 프로젝트를 생성합니다. 최종 편집과 영상 내보내기는 CapCut에서 진행합니다.

## 데모

약 54분짜리 영상의 영어 전사본에서 쇼츠 후보를 생성하고, CapCut에서 아래 세 영상을 내보냈습니다.

### 원본 영상

<p align="center">
  <a href="https://www.youtube.com/watch?v=Fls_onRviPM">
    <img src="https://i.ytimg.com/vi/Fls_onRviPM/hqdefault.jpg" alt="OpenAI DevDay 2026 Keynote 원본 영상" width="480">
  </a>
</p>

[OpenAI DevDay 2026 Keynote (FULL) — OpenAI](https://www.youtube.com/watch?v=Fls_onRviPM)

### 결과 영상

재생 버튼을 누르면 README 안에서 바로 볼 수 있습니다.

| Build together | Watch the speed | AI in research |
| :---: | :---: | :---: |
| <video src="https://github.com/user-attachments/assets/1dafb4ff-68bd-4c78-8462-397708c15e0b" controls></video> | <video src="https://github.com/user-attachments/assets/e2d4659e-39a5-43da-86f3-2fbdbe49ddaa" controls></video> | <video src="https://github.com/user-attachments/assets/dcb7342d-8a9b-4042-85c0-32d86c4b5960" controls></video> |
| 30.0초 | 29.6초 | 25.8초 |

## 실행 방법

macOS, Node.js 22 이상, CapCut Desktop이 필요합니다.

```bash
brew install ffmpeg
git clone https://github.com/leey00nsu/capcut-automation-public.git
cd capcut-automation-public
npm ci
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)에서 앱을 엽니다.

## 사용법

1. 원본 영상, 채널명, 영상 제목을 입력합니다.
2. 타임코드가 있는 전사 파일을 선택하거나 **로컬 전사 / OpenAI 전사**를 사용합니다.
3. AI 제공자와 후보 조건을 선택하고 **쇼츠 후보 생성**을 누릅니다.
4. 후보의 구간과 문구를 검토하고, **자막 설정**에서 스타일을 정한 뒤 **프로젝트 생성**을 누릅니다.
5. 생성된 프로젝트를 CapCut에서 열어 편집하고 영상을 내보냅니다.

Codex를 사용하려면 Codex CLI 설치와 ChatGPT 로그인이 필요합니다. OpenAI API를 사용하면 앱에서 API 키를 입력합니다.

프로젝트는 원본 영상을 그대로 참조하므로 파일 위치를 유지하고 외장 디스크를 연결해 두세요.
