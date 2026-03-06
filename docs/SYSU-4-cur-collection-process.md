# SYSU-4 CUR 수집 프로세스 정리

## 범위

- 대상 저장소: `platformDev/global/aws/aws-cron`
- 기준 브랜치: `master`
- 분석 기준: 코드 구조와 테스트 파일
- 제외 범위: 실제 DB 데이터, S3 버킷 실데이터, 운영 스케줄러 상태

## 결론 요약

- CUR 수집의 실제 진입점은 `src/cron/cron.service.ts`의 빌링 크론이다.
- 수집 자체만 단독 실행하는 API도 있지만, 운영 관점에서는 `CUR 다운로드/적재 -> Support Plan 보정 -> 요금 집계 -> 0달러 보정`까지 한 번에 수행하는 빌링 크론 흐름이 메인이다.
- CUR 원본은 각 payer 계정별 S3 버킷에서 `DailyResourceId-Manifest.json`을 먼저 읽고, manifest 안의 `reportKeys` 목록에 있는 gzip 리포트들을 내려받아 CSV로 풀어 적재한다.
- 적재 대상은 `aws_billing.cur_this_month` 또는 `aws_billing.cur_last_month` 테이블이다.
- 적재 후에는 CUR 테이블을 기준으로 일/월 단위 요금 집계 테이블들이 다시 생성된다.

## 1. 진입점

### 운영 진입점

- `src/cron/cron.service.ts`
  - `_thisMonthBilling()`: 이번 달 CUR 적재와 요금 가공
  - `_lastMonthBilling()`: 지난 달 CUR 적재와 요금 가공
- `src/cron/cron.controller.ts`
  - `POST /cron/billing`: 수동 실행용 API

### 보조 진입점

- `src/domain/cur/aws-cur.controller.ts`
  - `POST /cur`: CUR 다운로드 및 CUR 테이블 적재만 수행
- 운영 배치는 보통 `POST /cur`보다는 `CronService.billing()` 경로를 쓰는 편이 맞다.
  - 이유: 실제 운영 흐름은 CUR 적재 뒤에 Support Plan 보정과 요금 집계까지 연속 수행하기 때문이다.

## 2. 실행 대상 월 결정

- 이번 달:
  - `this_month`
  - 기본값은 현재 시각 기준 `YYYYMM`
- 지난 달:
  - `last_month`
  - 기본값은 현재 시각 기준 한 달 전 `YYYYMM`
- 둘 다 `cron_secret`, `this_or_last_month`, `year_month_number`를 입력받는다.

## 3. CUR 수집 상세 흐름

### 3-1. payer 계정 목록 조회

- `AwsCurService.curFileDownloadPromiseAllSettled()`
- `aws_credentials` 테이블에서 payer 자격증명 목록을 조회한다.
- 여기서 payer별로 다음 정보가 사용된다.
  - `bucket_name`
  - `access_key_id`
  - `secret_access_key`
  - `payer_account_id`

### 3-2. manifest 경로 계산

- `AwsCurService.getManifestDataFromS3()`
- `aws_report` 테이블(`PayerCurPrefixEntity`)에서 버킷별 CUR prefix 정보를 조회한다.
- manifest key는 아래 규칙으로 조합된다.

```text
{report_prefix}/{report_name}/{YYYYMM01-다음달01}/DailyResourceId-Manifest.json
```

- 예시 형태:

```text
prefix/report-name/20260301-20260401/DailyResourceId-Manifest.json
```

### 3-3. manifest 다운로드

- 각 payer 계정의 S3에 `GetObject`를 호출해 manifest JSON을 읽는다.
- manifest에서 최소 두 값을 사용한다.
  - `assemblyId`
  - `reportKeys`
- `reportKeys`가 없으면 해당 payer 수집은 실패 처리된다.

### 3-4. CUR gzip 파일 다운로드

- `AwsCurService.getCurDataFromAwsS3()`
- manifest의 `reportKeys` 배열을 순회하며 gzip 리포트를 모두 다운로드한다.
- 일부 report key라도 실패하면 그 payer 계정은 실패로 간주한다.
- 다만 전체 payer 작업은 `Promise.allSettled()`로 묶여 있어, 한 payer 실패가 다른 payer 수집을 중단시키지는 않는다.

### 3-5. 로컬 파일 생성 및 분할

- `AwsCurService.createFileFromCurData()`
- 다운로드한 gzip 스트림을 `CUR_BASE_PATH/{payerAccountId}/{yearMonth}/{assemblyId}` 아래에 저장한다.
- 이후 `gzip -d`로 압축을 해제해 CSV 파일을 만든다.
- 행 수가 `READ_MAX_CUR_ROW_BY_SINGLE_THREAD`보다 크면 `split` 명령으로 파일을 분할한다.
- 즉, 이 서비스는 메모리에서 바로 DB에 넣지 않고 일단 로컬 디스크에 CUR 파일을 만든 뒤 읽는다.

## 4. CSV 읽기와 필터링 규칙

### 4-1. 읽기 방식

- `AwsCurService.readCurCsvFile()`
- 작은 파일은 워커 스레드 1개로 처리한다.
- 큰 파일은 분할 파일마다 워커 스레드를 띄워 병렬 처리한다.
- 실제 CSV 파싱은 `src/utils/cur/cur-stream-to-promise.ts`에서 수행한다.

### 4-2. 필터링 규칙

- `lineItem/ProductCode === 'AWSSupportBusiness'` 인 행은 건너뛴다.
- `lineItem/LineItemType === 'Tax'` 인 행은 건너뛰고 `taxCurCount`만 증가시킨다.
- `bill/BillingEntity === 'AWSCostExplorer'` 인 경우 `lineItem/ProductCode`를 `product/ProductName`으로 대체한다.

### 4-3. 저장 컬럼

- 각 CSV row는 `curRawDataTransfer()`를 거쳐 insert value 문자열로 바뀐다.
- 저장 대상 핵심 컬럼은 아래와 같다.
  - 계정: `l_item_usage_account_id`, `b_payer_account_id`
  - 기간: `i_time_interval`, `i_bill_date_number`, `l_item_usage_start_date`, `l_item_usage_end_date`
  - 요금/사용량: `l_item_usage_amount`, `l_item_unblended_rate`, `l_item_unblended_cost`
  - 상품: `l_item_product_code`, `p_product_name`, `p_servicecode`, `p_region`, `p_transfer_type`
  - 약정: `s_savingplanarn`, `r_reservationarn`, `demand_rate`, `demand_cost`

## 5. CUR 테이블 적재 방식

### 이번 달

- `AwsCurService.thisMonthCurInsert()`
- 시작 시 `cur_this_month` 전체를 비운 뒤 다시 적재한다.
- insert는 `CurThisMonthRepository.bulkInsert()`의 raw SQL을 사용한다.

### 지난 달

- `AwsCurService.lastMonthCurInsert()`
- 시작 시 `cur_last_month` 전체를 비운 뒤 다시 적재한다.
- insert는 `CurLastMonthRepository.bulkInsert()`의 raw SQL을 사용한다.

### 공통 특징

- 파일 단위 통계가 `ResponseInsertCurDto`에 누적된다.
  - 파일명
  - 전체 행 수
  - 실제 insert 수
  - tax 제외 건수
- 대량 insert는 `BULK_INSERT_COUNT` 단위로 나눠 수행한다.

## 6. 적재 후 후속 처리

### 6-1. AWS Marketplace 상품명 보정

- `ProductCodeModifier.replaceProductCodeWithName()`
- `AWS Marketplace` 행의 난수성 product code를 `p_product_name` 기준으로 다시 치환한다.
- 동시에 별도 히스토리 테이블에도 upsert 한다.

### 6-2. Support Plan CUR 데이터 보정

- `AwsCurService.insertSupportPlanCurDataByThisOrLastMonth()`
- `support_plan_history`와 `aws_gabia_account`를 바탕으로 계정별 Support Plan 비용을 계산해 CUR 테이블에 추가 행을 넣는다.
- 이때 실제 AWS 사용료 구간 합계를 먼저 구한 뒤, 상품 가격 정책(`goods_price`)을 이용해 Support Plan 비용을 계산한다.
- 계산된 Support Plan 행도 최종적으로 CUR 테이블에 저장되므로 이후 집계 로직은 이 보정 데이터를 포함해 동작한다.

### 6-3. 통합 요금 집계

- `CronService._billingCostInsert()`
- 내부적으로 `BillingCommonService.billingIntegrated()`를 호출한다.
- 이 단계에서 CUR를 기반으로 아래 테이블들이 다시 만들어진다.
  - 일별 Base 요금
  - 일별 상품 요금
  - 일별 리전별 상품 요금
  - 일별 트래픽 요금
  - 월별 Base 요금
  - 월별 상품 요금
  - 월별 리전별 상품 요금
  - 월별 트래픽 요금
  - 일별 인스턴스 상세
  - 월별 인스턴스 합산
  - 월별 리전/상품 상세

### 6-4. 0달러 계정 보정

- `BillingMonthlyBaseService.baseMonthlyCostZeroUsdSetting()`
- 링크된 계정이지만 해당 월 CUR에 아무 행도 없어 월 기본요금이 생성되지 않은 계정은 `0 USD` 월 요금으로 보정한다.

## 7. 운영 스케줄

- 기본 샘플 설정 기준:
  - 이번 달 빌링: 매일 `05:30`, `17:30`
  - 지난 달 빌링: 매달 `1~4일 08:00`
- 다만 실제 운영값은 `.env`로 덮어쓰므로, 정확한 운영 시각은 배포 환경 변수 확인이 필요하다.
- `src/config/cron-config.ts`의 화면 노출 문구와 `.env.sample`의 cron 식이 일부 다르므로, 실제 판단 기준은 환경 변수 쪽으로 보는 편이 안전하다.

## 8. 관련 테이블 요약

- 원천/설정
  - `aws_credentials`: payer S3 접근 정보
  - `aws_report`: bucket별 report prefix/name
  - `aws_gabia_account`: linked account 메타데이터
  - `support_plan_history`: Support Plan 이력
  - `goods_price`: Support Plan 계산 기준 단가
- CUR 적재
  - `cur_this_month`
  - `cur_last_month`
- 후속 집계
  - `cost_daily*`
  - `cost_monthly*`
  - `daily_account_consumption_detail`
  - `monthly_account_consumption_detail`

## 9. 운영상 해석 포인트

- 이 서비스에서 "CUR 수집"은 단순 다운로드가 아니라, 운영상 거의 "월별 CUR 기준 빌링 데이터 재생성"에 가깝다.
- payer 기준 원본 다운로드는 병렬 처리하지만, CUR 집계 테이블 반영은 수집 완료 후 서비스 내부 순서대로 진행된다.
- 지난 달 수집은 월초 1~4일 동안 반복 수행되도록 설계되어 있어, AWS CUR의 지연 반영을 흡수하려는 의도가 보인다.
- 별도 소비량 집계 크론(`src/cron/service/cron.scheduled.service.ts`)도 존재하지만, 이는 CUR 원본 적재가 아니라 CUR 기반 소비량 상세 집계 후처리다.

## 10. 이번 분석의 한계

- 실제 운영 DB 값과 버킷 prefix는 확인하지 못했고, 코드 상 테이블/환경변수 계약만 확인했다.
- 실제 운영 환경의 cron 식, `CUR_BASE_PATH`, payer 계정 수, 파일 크기 분포는 별도 확인이 필요하다.
- 따라서 이 문서는 "운영 코드 기준 프로세스 정리"로 보는 것이 맞고, "운영 실측 리포트"는 아니다.
