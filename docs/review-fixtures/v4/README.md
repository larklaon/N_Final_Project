# V4 최종 검수 재현

원본 대상 `f3a0a82`, 결과와 수정 기준은 [V4_FINAL_REVIEW](../../V4_FINAL_REVIEW.md)를 따른다.

후속 V4.FIX에서는 이 재현을 `src/data/repositories/__tests__/V4Fixes.test.ts`와 `src/services/ai/__tests__/V4Runner.test.tsx`로 옮겨 회귀 검사로 수정했다. 현재 코드는 Owner에 generation을 추가했고 해설도 기준 사실로 구성하므로, 아래 원본 fixture는 당시 소스에서 재현할 때 사용한다. 현재 회귀 검사는 `npm test`로 실행한다.

- `V4Review.test.ts.fixture`: 실제 SQLite repository를 이용한 삭제/재개, 조정기, 해설 검토 4개.
- `V4RunnerReview.test.tsx.fixture`: 완료 대화의 새 준비 예약을 검사하는 hook 1개.
- 현재 구현에서는 모두 원하는 동작 단언에 실패한다. 외부 SIWC·사용자 DB·계정에 접근하지 않는다.
- 첫 네 개는 `src/data/repositories/__tests__/V4Review.test.ts`로, hook은 `src/services/ai/__tests__/V4RunnerReview.test.tsx`로 복사해야 상대 import가 맞는다.

앱 루트에서 아래 Python으로 임시 복사·실행·정리를 수행할 수 있다. 동일 파일이 있으면 덮어쓰지 않는다.

```sh
python3 - <<'PY'
from pathlib import Path
import shutil
import subprocess
pairs = [
    (Path('docs/review-fixtures/v4/V4Review.test.ts.fixture'), Path('src/data/repositories/__tests__/V4Review.test.ts')),
    (Path('docs/review-fixtures/v4/V4RunnerReview.test.tsx.fixture'), Path('src/services/ai/__tests__/V4RunnerReview.test.tsx')),
]
assert all(not target.exists() for _, target in pairs), 'Temporary test path already exists'
try:
    for source, target in pairs:
        shutil.copyfile(source, target)
    result = subprocess.run(['npx', 'jest', '--runInBand', '--runTestsByPath', *[str(p) for _, p in pairs]])
finally:
    for _, target in pairs:
        target.unlink(missing_ok=True)
raise SystemExit(result.returncode)
PY
```

R4는 잘못된 해설을 의도적으로 넣는 실패 fixture다. 해설이 검토 입력에 포함되지 않는 점과 정답 supported 응답만으로 후보가 승인되는 점을 함께 보인다. 실제 모델이 잘못된 해설을 생성했다는 실사용 기록이 아니다. 수정 시 독립 풀이에 정답이 유출되지 않도록 구현 방식에 맞게 회귀 단언을 다듬는다.
