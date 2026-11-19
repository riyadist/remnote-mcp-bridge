const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const research = require('./topic-chat-research.cjs');
const host = fs.readFileSync(require.resolve('./bridge-host.cjs'), 'utf8');
const code = host.slice(host.indexOf('async function getTranslateTopicChat('), host.indexOf('function setTranslateWarmupStatus('));

test('Codex cancellation waits for the actual owned process to close', async () => {
  let child;
  const controller = new AbortController();
  const runnerCode = host.slice(host.indexOf('function runCodexTranslation('), host.indexOf('function shouldRetryCodexTranslation('));
  const run = vm.runInNewContext(runnerCode + '\nrunCodexTranslation', {
    modelRoute:{run:(primary)=>primary()}, fs, path:require('node:path'), os:require('node:os'), process,
    randomUUID:require('node:crypto').randomUUID, setTimeout,clearTimeout,
    CODEX_DISABLED_FEATURES:[],
    resolveCodexExecutable:() => process.execPath,
    compactText:(s,n) => String(s || '').slice(0,n),
    startTranslateStage:() => ({}), finishTranslateStage:() => {},
    classifyTranslateError:() => ({errorClass:'TEST_ERROR'}),
    spawn:(_exe,_args,options) => {
      child = require('node:child_process').spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],options);
      child.once('spawn',() => controller.abort());
      return child;
    },
  });
  await assert.rejects(run('test',2000,null,{model:'test',signal:controller.signal}),/cancelled/);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test('real host keeps original frame and context but isolates fallback from rejected web output', async () => {
  const calls = [], traces = [];
  let cleaned = false;
  const getChat = vm.runInNewContext(code + '\ngetTranslateTopicChat', {
    Date, TRANSLATE_TOPIC_CHAT_MODEL:'test-model', TRANSLATE_TOPIC_CHAT_QUICK_MODEL:'quick',
    TRANSLATE_TOPIC_CHAT_TIMEOUT_MS:22000,
    compactText:(s,n) => String(s || '').slice(0,n),
    createTranslateTraceId:() => 'test', getTraceTextMeta:(s) => ({length:String(s).length}),
    normalizeTopicChatMessages:() => [], sceneEvidence:() => 'Original nineteen subtitles',
    topicChatIntent:{classifyTopicChatIntent:() => ({kind:'scene_explanation'})},
    topicChatResearch:research,
    topicChatFrame:{validateFrame:(f) => f, frameInstructions:() => 'ORIGINAL_FRAME',
      withFrameFile:async (_, fn) => {try {return await fn('original.jpg');} finally {cleaned = true;}}},
    buildTranslateTopicChatPrompt:() => 'ORIGINAL_SCENE_USER_QUESTION',
    runCodexTranslation:async (prompt,budget,trace,options) => {
      calls.push({prompt,budget,options});
      if (calls.length === 1) throw new Error('Research timed out');
      return 'Scene motivation explained';
    },
    writeTranslateTrace:(trace) => traces.push(trace),
    withTranslateErrorMeta:(e) => e,
  });
  const result = await getChat({question:'burada ne oluyor',selectedText:'Okay',sceneFrame:{timestamp:'00:25:24'},
    sceneContext:{mediaTitle:'Example S02E02',timestamp:'00:25:24',currentSubtitle:'Congratulations.'}});
  assert.equal(calls.length,2);
  assert.match(calls[0].prompt,/normal, kapsamli bir film sohbeti/);
  assert.equal(calls[1].options.localSceneOnly,true);
  assert.equal(calls[1].options.webSearchTelemetry,undefined);
  assert.equal(calls[1].options.imagePath,'original.jpg');
  assert.match(calls[1].prompt,/ORIGINAL_SCENE_USER_QUESTION/);
  assert.match(calls[1].prompt,/ORIGINAL_FRAME/);
  assert.doesNotMatch(calls[1].prompt,/REJECTED_EXTERNAL_FACT|SAHNE KAYNAGI ARASTIRMASI/);
  assert.equal(result.researchStatus,'local_context');
  assert.equal(result.frameUsed,true);
  assert.equal(traces[0].research.reason,'research_timeout');
  assert.equal(cleaned,true);
  assert.match(host,/if \(options\.localSceneOnly\) args\.push\('-c', 'web_search="disabled"', '--disable', 'shell_tool'\)/);
});
