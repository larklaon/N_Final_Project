import { database } from './database';
import { LearningRepository } from '../LearningRepository';
import { parseMemoryCandidates, parseContentCandidates, approvedByReview, reviewInput, type GenerationTarget } from '../../../domain/personalization';
import { beginChat, resetCoordinator, runRequest } from '../../../services/ai/requestCoordinator';
import { getSiwc, type AiEvent } from '../../../../modules/siwc-android';

jest.mock('../../../../modules/siwc-android', () => ({ getSiwc: jest.fn() }));
let now: number;
let repo: LearningRepository;
beforeEach(() => {
  now = Date.UTC(2026, 9, 18, 3); let id = 0;
  repo = new LearningRepository(database(), () => `review-${++id}`, () => now);
  repo.updateSettings({onboarded:true,aiConsentAt:1,personalizationEnabled:true,personalizationConsentAt:1,personalizationConsentVersion:'v4-1'});
  resetCoordinator();
});
afterEach(() => resetCoordinator());
const owner = () => ({learnerId:repo.activeLearner,subjectId:'info-basic',scope:repo.learningScope,generation:repo.personal.generation(repo.activeLearner)});
function memory() {
  for (const [id,qid] of [['g1','ds-queue-ox'],['g2','ds-stack-ox']]) {
    const q=repo.quiz(qid);
    repo.ingestGapEvents([{id,learnerId:repo.activeLearner,questionId:qid,selectedOptionId:q.options.find(o=>o.id!==q.correctOptionId)!.id,answeredAt:now}]);
  }
  const input=repo.extractionInput();
  const text=JSON.stringify({candidates:[{conceptId:'ds-queue',skillKey:'stack-queue-order',summary:'스택과 큐의 순서를 혼동했을 가능성',evidenceRefs:input.evidence.map(e=>e.ref),kind:'wrong-choice'}]});
  const candidates=parseMemoryCandidates(text,input);
  const [id]=repo.personal.applyCandidates(owner(),input,candidates)!;
  return {id,input,candidates};
}
function card(memoryId:string) {
 return repo.personal.saveApproved(owner(),{kind:'gap',conceptId:'ds-queue',memoryId,skillKey:'stack-queue-order',factIds:['f-queue-fifo'],prompt:'큐는 먼저 넣은 것을 먼저 꺼낸다.',correctOptionId:'o',explanation:'선입선출이에요.',model:'m',review:{verdict:'supported'}})!;
}

test('R1: deleting a memory prevents an in-flight extraction from recreating it',()=>{
 const {id}=memory(); const captured=owner();
 now+=1000;const q=repo.quiz('ds-queue-ox');
 repo.ingestGapEvents([{id:'g3',learnerId:repo.activeLearner,questionId:q.id,selectedOptionId:q.options.find(o=>o.id!==q.correctOptionId)!.id,answeredAt:now}]);
 const input=repo.extractionInput();
 const candidates=parseMemoryCandidates(JSON.stringify({candidates:[{conceptId:'ds-queue',skillKey:'stack-queue-order',summary:'큐 순서 혼동',evidenceRefs:['gap:g3'],kind:'wrong-choice'}]}),input);
 repo.personal.deleteMemory(repo.activeLearner,id);
 repo.personal.applyCandidates(captured,input,candidates);
 expect(repo.personal.memories(repo.activeLearner)).toHaveLength(0);
});

test.each(['delete','ignore','off','hide'] as const)('R2: %s stops resuming and submitting an unanswered check',boundary=>{
 const {id}=memory();const c=card(id);
 repo.ingestGapEvents([{id:'card-answer',learnerId:repo.activeLearner,questionId:c.quiz.id,selectedOptionId:'o',answeredAt:now}]);
 repo.personal.saveApproved(owner(),{kind:'check',conceptId:'ds-queue',memoryId:id,skillKey:'stack-queue-order',factIds:['f-queue-fifo'],prompt:'대기 순서를 유지할 자료구조는?',options:[{id:'a',text:'큐'},{id:'b',text:'스택'},{id:'c',text:'트리'},{id:'d',text:'그래프'}],correctOptionId:'a',explanation:'선입선출이에요.',model:'m',review:{verdict:'supported'}});
 now+=25*3600000;
 const check=repo.checkSession()!;expect(check.checkMemoryId).toBe(id);
 if(boundary==='delete')repo.personal.deleteMemory(repo.activeLearner,id);
 if(boundary==='ignore')repo.personal.ignoreMemory(repo.activeLearner,id);
 if(boundary==='off')repo.updateSettings({personalizationEnabled:false});
 if(boundary==='hide')repo.personal.hide(repo.activeLearner,check.quizId.slice(3));
 expect(repo.checkSession()).toBeNull();
 expect(repo.openSession('ds-queue').quizId).not.toBe(check.quizId);
 expect(()=>repo.submit(check.id,'a')).toThrow('확인 문제가 변경');
});

test('R3: two queued requests must not start simultaneously after chat releases the slot',async()=>{
 jest.useFakeTimers();
 const listeners=new Set<(e:AiEvent)=>void>(); let n=0;
 const startResponse=jest.fn(async()=>({requestId:`req-${++n}`}));
 const emit=(e:AiEvent)=>[...listeners].forEach(l=>l(e));
 jest.mocked(getSiwc).mockReturnValue({startResponse,cancelResponse:jest.fn(async(id:string)=>emit({requestId:id,type:'cancelled'})),addListener:(_:string,l:(e:AiEvent)=>void)=>{listeners.add(l);return{remove:()=>listeners.delete(l)}}} as unknown as ReturnType<typeof getSiwc>);
 const release=await beginChat();
 const c1=new AbortController(),c2=new AbortController();
 const p1=runRequest('background',{job:1},c1.signal).catch(()=>{});
 const p2=runRequest('plan',{job:2},c2.signal).catch(()=>{});
 release();for(let i=0;i<6;i++)await Promise.resolve();
 const count=startResponse.mock.calls.length;
 c1.abort();c2.abort();jest.runAllTimers();await Promise.all([p1,p2]);jest.useRealTimers();
 expect(count).toBe(1);
});

test('R4: blind review retains independence; displayed explanation comes only from approved facts',()=>{
 const target:GenerationTarget={memoryId:'m',conceptId:'ds-queue',skillKey:'stack-queue-order',summary:'순서 혼동',facts:[{factId:'f-queue-fifo',text:'선입선출',condition:''}],wantGap:true,wantCheck:false};
 const drafts=parseContentCandidates(JSON.stringify({gap:[{memoryId:'m',conceptId:'ds-queue',basisId:'v4-basis',factIds:['f-queue-fifo'],prompt:'큐는 먼저 넣은 것을 먼저 꺼낸다.',answer:'o',explanation:'큐는 후입선출이라 마지막에 넣은 것부터 꺼내요.'}]}),[target]);
 expect(drafts).toHaveLength(1);
 const payload=reviewInput(drafts);
 const approved=approvedByReview(JSON.stringify({reviews:[{index:0,answer:'o',factIds:['f-queue-fifo'],verdict:'supported'}]}),drafts);
 expect(JSON.stringify(payload)).not.toContain('큐는 후입선출');
 expect(approved).toHaveLength(1);
 expect(approved[0].draft.explanation).toContain('선입선출');
 expect(approved[0].draft.explanation).not.toContain('후입선출');
});

test.each(['delete','ignore'] as const)('R1: %s cancels old extraction and approval, but permits genuinely new evidence',how=>{
 const {id}=memory();const oldCard=card(id);const captured=owner();
 const q=repo.quiz('ds-queue-ox');
 repo.ingestGapEvents([{id:'waiting',learnerId:repo.activeLearner,questionId:q.id,selectedOptionId:'x',answeredAt:now}]);
 const input=repo.extractionInput();
 const candidates=parseMemoryCandidates(JSON.stringify({candidates:[{conceptId:'ds-queue',skillKey:'stack-queue-order',summary:'순서 혼동',evidenceRefs:['gap:waiting'],kind:'wrong-choice'}]}),input);
 const invalidated=jest.fn();const remove=repo.personal.onInvalidated(invalidated);
 if(how==='delete')repo.personal.deleteMemory(repo.activeLearner,id);else repo.personal.ignoreMemory(repo.activeLearner,id);
 expect(invalidated).toHaveBeenCalledTimes(1);remove();
 expect(repo.personal.applyCandidates(captured,input,candidates)).toBeNull();
 expect(repo.personal.saveApproved(captured,{kind:'gap',conceptId:'ds-queue',memoryId:id,skillKey:'stack-queue-order',factIds:['f-queue-fifo'],prompt:'새 카드',correctOptionId:'o',explanation:'생성 설명',model:'m',review:{}})).toBeNull();
 expect(repo.extractionInput().evidence).toHaveLength(0);
 expect(repo.personal.row(oldCard.id,repo.activeLearner)?.status).toBe('hidden');
 now+=1000;repo.ingestGapEvents([{id:'after-delete',learnerId:repo.activeLearner,questionId:q.id,selectedOptionId:'x',answeredAt:now}]);
 const fresh=repo.extractionInput();expect(fresh.evidence.map(e=>e.ref)).toEqual(['gap:after-delete']);
 const c=parseMemoryCandidates(JSON.stringify({candidates:[{...candidates[0],evidenceRefs:['gap:after-delete']}]}),fresh);
 expect(repo.personal.applyCandidates(owner(),fresh,c)).toHaveLength(1);
});

test('R4: storage ignores the generator explanation and retains the full basis condition',()=>{
 const {id}=memory();const saved=repo.personal.saveApproved(owner(),{kind:'gap',conceptId:'ds-queue',memoryId:id,skillKey:'stack-queue-order',factIds:['f-queue-fifo'],prompt:'큐는 먼저 넣은 것을 먼저 꺼낸다.',correctOptionId:'o',explanation:'큐는 후입선출이에요.',model:'m',review:{}})!;
 expect(saved.quiz.explanation).toContain('선입선출');
 expect(saved.quiz.explanation).toContain('우선순위 큐 제외');
 expect(saved.quiz.explanation).not.toContain('후입선출');
 expect(repo.quiz(saved.quiz.id).explanation).toBe(saved.quiz.explanation);
});

test('R3: highest priority starts alone, queued cancellation is immediate, and the next waits for terminal',async()=>{
 const listeners=new Set<(e:AiEvent)=>void>();let n=0;
 const startResponse=jest.fn(async(_raw:string)=>({requestId:`fifo-${++n}`}));
 const emit=(e:AiEvent)=>[...listeners].forEach(l=>l(e));
 jest.mocked(getSiwc).mockReturnValue({startResponse,cancelResponse:jest.fn(async(id:string)=>emit({requestId:id,type:'cancelled'})),addListener:(_:string,l:(e:AiEvent)=>void)=>{listeners.add(l);return{remove:()=>listeners.delete(l)}}} as unknown as ReturnType<typeof getSiwc>);
 const release=await beginChat();const a=new AbortController(),b=new AbortController(),c=new AbortController();
 const background=runRequest('background',{job:'background'},a.signal);
 const plan=runRequest('plan',{job:'plan'},b.signal);
 const cancelled=runRequest('background',{job:'cancelled'},c.signal).catch((e:Error)=>e.message);
 c.abort();expect(await cancelled).toBe('plan_invalidated');
 release();await Promise.resolve();await Promise.resolve();
 expect(startResponse).toHaveBeenCalledTimes(1);
 expect(JSON.parse(startResponse.mock.calls[0][0] as string).job).toBe('plan');
 emit({requestId:'fifo-1',type:'completed',text:'plan'});expect(await plan).toBe('plan');
 await Promise.resolve();await Promise.resolve();expect(startResponse).toHaveBeenCalledTimes(2);
 emit({requestId:'fifo-2',type:'completed',text:'background'});expect(await background).toBe('background');
});

test('R1: invalidation generation survives a repository reopen',()=>{
 const db=database();let id=0;
 const make=()=>new LearningRepository(db,()=>`persist-${++id}`,()=>now);
 const first=make();const learner=first.activeLearner;
 db.runSync("INSERT INTO confusion_memories(id,learnerId,subjectId,conceptId,skillKey,summary,status,createdAt,lastEvidenceAt) VALUES (?,?, 'info-basic','ds-queue','stack-queue-order','순서 혼동','active',?,?)",'persist-memory',learner,now,now);
 const old={learnerId:learner,subjectId:'info-basic',scope:first.learningScope,generation:first.personal.generation(learner)};
 first.personal.deleteMemory(learner,'persist-memory');
 const reopened=make();
 expect(reopened.personal.generation(learner)).toBe(old.generation+1);
 expect(reopened.personal.isOwnerCurrent(old)).toBe(false);
});


test('R5: only a completed learner/assistant pair announces new preparation input',()=>{
 const changed=jest.fn();const remove=repo.onPersonalizationInput(changed);
 repo.addChatMessage(repo.activeLearner,'ds-queue','assistant','이전 답만 남음');
 expect(changed).not.toHaveBeenCalled();
 repo.addChatMessage(repo.activeLearner,'ds-queue','user','큐도 나중에 넣은 것이 먼저 나오나요?');
 expect(changed).not.toHaveBeenCalled();
 repo.addChatMessage(repo.activeLearner,'ds-queue','assistant','먼저 넣은 것이 먼저 나와요.');
 expect(changed).toHaveBeenCalledTimes(1);
 repo.addChatMessage(repo.activeLearner,'ds-queue','assistant','추가 설명만 있어요.');
 expect(changed).toHaveBeenCalledTimes(1);remove();
 repo.addChatMessage(repo.activeLearner,'ds-queue','user','다음 질문이에요.');
 repo.addChatMessage(repo.activeLearner,'ds-queue','assistant','다음 답이에요.');
 expect(changed).toHaveBeenCalledTimes(1);
});
