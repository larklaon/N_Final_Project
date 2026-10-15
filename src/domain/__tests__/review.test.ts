import { advanceProgress, canGrade, DAY, occurrenceId } from '../review';
const now = Date.UTC(2026,9,15);
test('wrong answer is due after ten minutes; correcting next day advances', () => {
 const wrong = advanceProgress(undefined,false,now,'2026-10-15','choice');
 expect(wrong.stage).toBe(0); expect(wrong.dueAt).toBe(now+600_000);
 const correct=advanceProgress(wrong,true,now+DAY,'2026-10-16','ox');
 expect(correct.stage).toBe(1); expect(correct.correctAttempts).toBe(1); expect(correct.gradedAttempts).toBe(2); expect(correct.dueAt).toBe(now+2*DAY);
});
test('same-day corrections do not increase distinct correct days', () => {
 const first=advanceProgress(undefined,true,now,'2026-10-15','choice');
 expect(advanceProgress(first,true,now+1000,'2026-10-15','ox').distinctCorrectDays).toBe(1);
});
test('stale or early sessions cannot alter progress', () => {
 const p=advanceProgress(undefined,true,now,'2026-10-15','choice');
 expect(canGrade(p,0,now+DAY)).toBe(false); expect(canGrade(p,1,now+100)).toBe(false); expect(canGrade(p,1,now+DAY)).toBe(true);
 expect(occurrenceId('a','b',0)).not.toBe(occurrenceId('a','b',1));
});
test('stage caps at five and maximum interval is thirty days', () => {
 let p=advanceProgress(undefined,true,now,'2026-10-15','choice');
 for(let i=0;i<10;i++) p=advanceProgress(p,true,now,`2026-10-${16+i}`,'ox');
 expect(p.stage).toBe(5);expect(p.dueAt).toBe(now+30*DAY);
});
