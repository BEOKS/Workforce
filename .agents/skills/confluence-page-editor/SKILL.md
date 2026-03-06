---
name: confluence-page-editor
description: Confluence 페이지를 CQL로 검색하고, 특정 페이지의 본문/메타데이터를 조회하고, storage HTML 기반으로 페이지를 생성하거나 수정할 때 사용하는 로컬 스킬. `confluence.gabia.com` 문서 검색, 페이지 상세 조회, 매크로가 포함된 HTML 본문 작성, 라벨이 포함된 페이지 생성/수정, CQL 기반 문서 탐색이 필요할 때 사용한다.
---

# Confluence Page Editor

`confluence-page-editor`는 Confluence 페이지 작업을 storage HTML 중심으로 처리한다. 매크로와 레이아웃을 보존해야 하면 Markdown보다 HTML(storage) 본문을 우선한다.

## 빠른 판단

- 문서를 찾고 싶으면 `scripts/confluence_page_cli.py search`
- 특정 문서의 현재 상태를 보고 싶으면 `scripts/confluence_page_cli.py get`
- 새 문서를 만들고 싶으면 `scripts/confluence_page_cli.py create`
- 기존 문서를 덮어쓰거나 라벨을 조정하고 싶으면 `scripts/confluence_page_cli.py update`

## 전제 조건

- `.env` 또는 셸 환경에 다음 값이 있어야 한다.
  - `CONFLUENCE_BASE_URL`
  - 인증 정보
    - `CONFLUENCE_AUTH_HEADER`
    - 또는 `ATLASSIAN_OAUTH_ACCESS_TOKEN`
    - 또는 `CONFLUENCE_USERNAME` + `CONFLUENCE_API_TOKEN`
    - 또는 `ATLASSIAN_EMAIL` + `ATLASSIAN_API_TOKEN`
    - 또는 `CONFLUENCE_API_TOKEN`
- `CONFLUENCE_API_TOKEN`만 있을 때는 다음 순서로 해석한다.
  - `Basic ...` / `Bearer ...` 형태면 그대로 사용
  - base64 디코딩 시 `user:token` 꼴이면 `Basic <token>`으로 사용
  - 그 외에는 `Bearer <token>`으로 사용

## 권장 워크플로우

1. 먼저 `search`로 대상 페이지를 좁힌다.
2. 수정 전에는 반드시 `get`으로 현재 제목, 라벨, 본문 형식, 부모 페이지를 확인한다.
3. 매크로나 표, 레이아웃을 유지해야 하면 storage HTML 파일을 만든 뒤 `create` 또는 `update`에 `--content-file`로 넘긴다.
4. 라벨을 정확히 맞춰야 하면 `update --replace-labels`를 사용한다.

## 명령 예시

```bash
# CQL 검색
python3 .agents/skills/confluence-page-editor/scripts/confluence_page_cli.py search \
  --cql 'space = "DEV" AND type = page AND title ~ "배포" ORDER BY lastmodified DESC' \
  --limit 10

# 간단 검색어를 CQL로 감싸서 검색
python3 .agents/skills/confluence-page-editor/scripts/confluence_page_cli.py search \
  --query '릴리즈 노트'

# 페이지 상세 조회
python3 .agents/skills/confluence-page-editor/scripts/confluence_page_cli.py get \
  --page-id 241911562

# 새 페이지 생성
python3 .agents/skills/confluence-page-editor/scripts/confluence_page_cli.py create \
  --space-key DEV \
  --title '릴리즈 노트 - 2026-03-06' \
  --content-file ./release-note.storage.html \
  --label release-note \
  --label automation

# 기존 페이지 수정
python3 .agents/skills/confluence-page-editor/scripts/confluence_page_cli.py update \
  --page-id 241911562 \
  --content-file ./release-note.storage.html \
  --label release-note \
  --labels automation,team-a \
  --replace-labels \
  --version-comment '자동 업데이트: 배포 요약 반영'
```

## 작성 원칙

- 생성/수정 본문은 기본적으로 storage HTML로 작성한다.
- 매크로가 필요한 경우 storage HTML 안에 Confluence 매크로 태그를 직접 넣는다.
- `get` 결과의 `body.storage`를 템플릿 삼아 수정하는 방식이 가장 안전하다.
- 라벨은 `--label` 반복 또는 `--labels a,b,c`로 넣는다.
- 기존 라벨을 유지한 채 추가만 하려면 기본 동작을 사용하고, 정확히 교체하려면 `--replace-labels`를 쓴다.

## 참고 자료

- CQL 예시와 storage HTML 매크로 샘플이 필요하면 `references/cql-and-storage.md`를 읽는다.
