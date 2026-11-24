import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPilotStore, FirestoreRestPilotStore } from './store.ts';
import type { FundedNextCredentialEnvelope } from './cryptoEnvelope.ts';
import type { BrokerAccount } from './brokerTypes.ts';

const credential = { ciphertext: 'opaque' } as unknown as FundedNextCredentialEnvelope;
const accounts = ['a', 'b', 'c', 'd'].map(accountId => ({accountId, login:null, rawPayload:{}, fetchedAt:'2026-01-01T00:00:00Z'} as BrokerAccount));
async function fixture() {
  let clock = 1000;
  const store = new InMemoryPilotStore({now: () => clock});
  await store.setAllowlisted('user', true);
  await store.activateConnection('user', 'first', credential, clock, 0);
  const lease = await store.leaseNext('worker', 1000);
  assert.ok(lease);
  await store.saveAccounts(lease, accounts);
  return {store, lease, tick:(n:number) => {clock += n;}};
}

test('expired and superseded discovery leases cannot write or finish', async () => {
  const {store, lease, tick} = await fixture();
  tick(1000);
  await assert.rejects(store.saveAccounts(lease, []));
  const next = await store.leaseNext('worker2', 500);
  assert.ok(next && next.fencingToken > lease.fencingToken);
  await assert.rejects(store.finish(lease));
  await store.disconnect('user','first');
  await assert.rejects(store.replaceCredential(next,credential));
  await assert.rejects(store.activateConnection('user','first',credential,2000,1));
});

test('three-account cap applies across simultaneous tracking requests and connections', async () => {
  const {store,lease} = await fixture();
  await store.finish(lease);
  await store.activateConnection('user','second',credential,1000,0);
  const second = await store.leaseNext('other',500);
  assert.ok(second);
  await store.saveAccounts(second,accounts);
  await store.finish(second);
  const toggles = await Promise.allSettled(['a','b','c','d'].map((id,i) => store.setTracked('user',i%2?'first':'second',id,true)));
  assert.equal(toggles.filter(r => r.status==='fulfilled').length,3);
  assert.equal((await store.listAccounts('user')).filter(a=>a.tracked).length,3);
});

test('a Firestore transaction retries ABORTED commits and reads in the new transaction', async () => {
  const requests: {url:string, body:any}[] = [];
  let sequence=0;
  const fakeFetch:typeof fetch = async (input,init) => {
    const url=String(input);
    const body=JSON.parse(String(init?.body || '{}'));
    requests.push({url,body});
    const send=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
    if(url.endsWith(':beginTransaction')) return send({transaction:'t'+(++sequence)});
    if(url.endsWith(':batchGet')) return send([{found:{name:body.documents[0],fields:{enabled:{booleanValue:true}}}}]);
    if(url.endsWith(':commit') && sequence===1) return send({error:{status:'ABORTED'}},409);
    if(url.endsWith(':commit') || url.endsWith(':rollback')) return send({});
    throw Error('Unexpected REST call');
  };
  const store=new FirestoreRestPilotStore({projectId:'demo',getAccessToken:async()=>'fake',fetch:fakeFetch});
  assert.equal(await store.isAllowlisted('user'),true);
  assert.deepEqual(requests.filter(r=>r.url.endsWith(':batchGet')).map(r=>r.body.transaction),['t1','t2']);
});
