# CQL And Storage HTML

## CQL 예시

```text
space = "DEV" AND type = page ORDER BY lastmodified DESC
space = "DEV" AND title ~ "릴리즈 노트"
space = "DEV" AND label = "release-note"
siteSearch ~ "\"incident review\""
creator = currentUser() AND type = page
parent = 241911562
```

## storage HTML 예시

Confluence 매크로는 storage HTML에서 직접 다루는 편이 가장 안정적이다.

```xml
<h1>릴리즈 노트</h1>
<p>2026-03-06 배포 요약입니다.</p>
<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p>중요 변경 사항을 먼저 확인하세요.</p>
  </ac:rich-text-body>
</ac:structured-macro>
<table>
  <tbody>
    <tr>
      <th>항목</th>
      <th>내용</th>
    </tr>
    <tr>
      <td>서비스</td>
      <td>API Gateway</td>
    </tr>
  </tbody>
</table>
```

## 수정 팁

- 기존 페이지를 수정할 때는 먼저 `get`으로 `body.storage`를 가져온다.
- 그 HTML을 파일로 저장한 뒤 필요한 블록만 수정한다.
- 매크로가 많으면 새로 쓰기보다 기존 storage HTML을 보존하며 수정한다.
- 라벨은 본문이 아니라 별도 API로 다루므로 `--label` 또는 `--replace-labels`를 함께 사용한다.
