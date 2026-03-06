---
name: gitlab-env-operator
description: GitLab REST API와 git CLI를 `.env` 환경변수로 묶어 저장소 검색, 프로젝트 조회, clone, 브랜치 커밋/푸시, Merge Request 생성, 이슈 생성/조회/수정/삭제를 자동화한다. GitLab URL이나 `group/project` 경로를 받아 실제 저장소 작업과 이슈/MR 작업을 함께 처리해야 할 때 사용한다.
---

# GitLab Env Operator

이 래퍼는 전역 설치된 GitLab 스킬을 워크스페이스에서 명시적으로 사용하게 한다.

소스 오브 트루스:

- `/Users/leejs/.codex/skills/gitlab-env-operator/SKILL.md`
- `/Users/leejs/.codex/skills/gitlab-env-operator/references/env-and-workflows.md`
- `/Users/leejs/.codex/skills/gitlab-env-operator/scripts/gitlab_project_cli.py`
- `/Users/leejs/.codex/skills/gitlab-env-operator/scripts/gitlab_issue_cli.py`
- `/Users/leejs/.codex/skills/gitlab-env-operator/scripts/gitlab_mr_cli.py`

이 스킬을 사용할 때:

1. `/Users/leejs/.codex/skills/gitlab-env-operator/SKILL.md`를 읽는다.
2. 환경변수나 대표 워크플로우가 필요하면 `/Users/leejs/.codex/skills/gitlab-env-operator/references/env-and-workflows.md`를 읽는다.
3. 실제 GitLab 프로젝트/이슈/MR/저장소 작업은 해당 CLI 스크립트로 수행한다.
4. 중첩 Codex 샌드박스에서는 GitLab 호스트가 명령 인자에 직접 보이도록 `--project` 와 raw `git` 대상에 전체 GitLab HTTPS URL을 우선 사용한다.
