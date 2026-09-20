/* Topic organisation uses the existing owned chats rows, not a second transcript.
 * Metadata is removed before rendering or sending messages to the mentor. */
var margChatThreads = [], margAllChatMessages = [], margActiveThreadId = 'legacy';
var margThreadOwner = null, margThreadStates = {}, topicChatDeletionInFlight = false;

function decodeTopicChatRow(row) {
  var content=String(row.content||''),meta=null,match=content.match(/\n\[MARG_THREAD:([^\]]+)\]$/);
  if(match)try{var candidate=JSON.parse(decodeURIComponent(match[1]));if(candidate&&/^(?:legacy|[a-f0-9-]{36})$/.test(candidate.id)&&typeof candidate.title==='string'&&candidate.title.length<=80){meta=candidate;content=content.slice(0,match.index);}}catch(e){}
  return {id:row.id||null,role:row.role,content:content,createdAt:row.created_at||row.createdAt||null,threadId:meta?meta.id:'legacy',threadTitle:meta?meta.title:'Earlier conversation'};
}

function encodeTopicChatContent(content,item) {
  var id=item&&item.threadId||margActiveThreadId,title=item&&item.threadTitle;
  var thread=margChatThreads.find(function(t){return t.id===id;});
  title=title||thread&&thread.title||'CAT conversation';
  return String(content)+'\n[MARG_THREAD:'+encodeURIComponent(JSON.stringify({id:id,title:title.slice(0,80)}))+']';
}

function topicChatStorageKey(){return 'marg_chat_topics_'+(currentUser&&currentUser.id||'guest');}

function persistTopicChatIndex() {
  var states={};
  Object.keys(margThreadStates||{}).forEach(function(id){
    var state=margThreadStates[id]||{};
    states[id]={
      diagnostic:state.diagnostic||null,
      flow:state.flow||null,
      mockPriority:state.mockPriority||'',
      mockSource:state.mockSource||'',
      diagnosticTopic:state.diagnosticTopic||null,
      optionsState:state.optionsState||null
    };
  });
  try{localStorage.setItem(topicChatStorageKey(),JSON.stringify({active:margActiveThreadId,threads:margChatThreads,states:states}));}catch(e){}
}

function captureActiveTopicChat() {
  if(margThreadOwner!==(currentUser&&currentUser.id||'guest'))return;
  conversationHistory.forEach(function(item){item.threadId=item.threadId||margActiveThreadId;});
  margAllChatMessages=margAllChatMessages.filter(function(item){return item.threadId!==margActiveThreadId;}).concat(conversationHistory);
  margThreadStates[margActiveThreadId]={exercise:typeof activeGeneratedExercise!=='undefined'?activeGeneratedExercise:null,failed:typeof lastFailedOutgoingMessage!=='undefined'?lastFailedOutgoingMessage:null,diagnostic:typeof chatDiagnosticState!=='undefined'?chatDiagnosticState:null,flow:typeof diagnosticFlowState!=='undefined'?diagnosticFlowState:null};
  margThreadStates[margActiveThreadId].mockPriority=typeof activeMockReviewPriority!=='undefined'?activeMockReviewPriority:'';
  margThreadStates[margActiveThreadId].mockSource=typeof activeMockReviewSource!=='undefined'?activeMockReviewSource:'';
  margThreadStates[margActiveThreadId].diagnosticTopic=typeof activeDiagnosticTopic!=='undefined'?activeDiagnosticTopic:null;
  margThreadStates[margActiveThreadId].optionsState=typeof margPendingConversationOptions!=='undefined'?margPendingConversationOptions:null;
  persistTopicChatIndex();
}

function initialiseTopicChats(rows) {
  margThreadOwner=currentUser&&currentUser.id||'guest';margThreadStates={};margAllChatMessages=(rows||[]).map(decodeTopicChatRow);
  var saved={};try{saved=JSON.parse(localStorage.getItem(topicChatStorageKey())||'{}')||{};}catch(e){}
  margThreadStates=saved.states&&typeof saved.states==='object'?saved.states:{};
  margChatThreads=Array.isArray(saved.threads)?saved.threads.filter(function(t){return t&&/^(?:legacy|[a-f0-9-]{36})$/.test(t.id)&&typeof t.title==='string';}):[];
  margAllChatMessages.forEach(function(item){if(!margChatThreads.some(function(t){return t.id===item.threadId;}))margChatThreads.push({id:item.threadId,title:item.threadTitle});});
  if(!margChatThreads.length)margChatThreads=[{id:'legacy',title:'CAT conversation'}];
  var latest=margAllChatMessages[margAllChatMessages.length-1];
  margActiveThreadId=margChatThreads.some(function(t){return t.id===saved.active;})?saved.active:latest?latest.threadId:margChatThreads[0].id;
  conversationHistory=margAllChatMessages.filter(function(item){return item.threadId===margActiveThreadId;});
  renderTopicChatToolbar();
}

function renderTopicChatToolbar() {
  var select=document.getElementById('chat-topic-select');
  if(select){select.innerHTML=margChatThreads.map(function(t){return '<option value="'+escapeChatHtml(t.id)+'">'+escapeChatHtml(t.title)+'</option>';}).join('');select.value=margActiveThreadId;select.disabled=!!isLoading;}
  var button=document.getElementById('new-topic-chat');if(button)button.disabled=!!isLoading||topicChatDeletionInFlight;
  var lists=[document.getElementById('desktop-chat-list'),document.getElementById('mobile-chat-list')];
  var html=margChatThreads.slice().reverse().map(function(t){
    var active=t.id===margActiveThreadId?' active':'';
    var safeId=escapeChatHtml(t.id),safeTitle=escapeChatHtml(t.title);
    return '<div class="sidebar-chat-row'+active+'"><button type="button" class="sidebar-chat-item'+active+'" onclick="openTopicChatFromSidebar(\''+safeId+'\')" aria-current="'+(active?'page':'false')+'"><span class="sidebar-chat-title">'+safeTitle+'</span></button><button type="button" class="sidebar-chat-delete" onclick="event.stopPropagation();requestDeleteTopicChat(\''+safeId+'\')" aria-label="Delete chat: '+safeTitle+'" title="Delete chat"'+(topicChatDeletionInFlight?' disabled':'')+'>×</button></div>';
  }).join('');
  lists.forEach(function(list){if(list)list.innerHTML=html;});
}

function applyTopicChatState(id) {
  margActiveThreadId=id;
  var input=document.getElementById('user-input');if(input){input.value='';input.style.height='auto';}
  conversationHistory=margAllChatMessages.filter(function(item){return item.threadId===id;});
  var state=margThreadStates[id]||{};
  if(typeof activeMockReviewPriority!=='undefined')activeMockReviewPriority=state.mockPriority||'';
  if(typeof activeMockReviewSource!=='undefined')activeMockReviewSource=state.mockSource||'';
  if(typeof activeDiagnosticTopic!=='undefined')activeDiagnosticTopic=state.diagnosticTopic||null;
  activeGeneratedExercise=state.exercise||null;lastFailedOutgoingMessage=state.failed||null;
  if(typeof stopArticleRCTimer==='function')stopArticleRCTimer();
  if(typeof pendingExternalQuestion!=='undefined')pendingExternalQuestion=null;
  if(typeof chatDiagnosticState!=='undefined')chatDiagnosticState=state.diagnostic||{active:false,topic:null,subcategory:null,pattern:null,rejectedCount:0};
  if(typeof diagnosticFlowState!=='undefined')diagnosticFlowState=state.flow||{active:false,firstTime:false,topic:null,subcategory:null,pattern:null,stage:'root'};
  if(typeof pendingDiagnosticExercise!=='undefined')pendingDiagnosticExercise=null;
  if(typeof pendingExternalQuestionTurnMode!=='undefined')pendingExternalQuestionTurnMode='';
  if(typeof guidedGenerationState!=='undefined')guidedGenerationState=null;
  if(typeof margPendingConversationOptions!=='undefined')margPendingConversationOptions=state.optionsState||null;
  pendingImageAttachments=[];queuedOutgoingMessage=null;
  if(typeof renderPendingImageAttachments==='function')renderPendingImageAttachments();
  var messages=document.getElementById('messages');if(messages)messages.innerHTML='';
  captureActiveTopicChat();restoreConversation();renderTopicChatToolbar();return true;
}

function switchTopicChat(id) {
  if(isLoading||responseRegenerationInFlight||topicChatDeletionInFlight){renderTopicChatToolbar();return false;}
  if(!margChatThreads.some(function(t){return t.id===id;})||id===margActiveThreadId){renderTopicChatToolbar();return false;}
  saveCurrentChatDraft();captureActiveTopicChat();margActiveThreadId=id;
  return applyTopicChatState(id);
}

function filterRowsOutsideTopicChat(rows,id) {
  return (rows||[]).filter(function(row){return decodeTopicChatRow(row).threadId!==id;});
}

function topicChatScopedStorageKeys(userId,id) {
  var suffix=id==='legacy'?'':'_'+id;
  return [
    'marg_chat_draft_'+userId+suffix,
    'marg_active_exercise_'+userId+suffix,
    'marg_pending_external_question_'+userId+suffix,
    'marg_pending_diagnostic_'+userId+'_'+id
  ];
}

function clearTopicChatLocalState(userId,id) {
  topicChatScopedStorageKeys(userId,id).forEach(function(key){try{localStorage.removeItem(key);}catch(e){}});
  try {
    var archiveKey='marg_exercise_archive_'+userId;
    var archive=JSON.parse(localStorage.getItem(archiveKey)||'[]');
    if(Array.isArray(archive))localStorage.setItem(archiveKey,JSON.stringify(archive.filter(function(item){return item&&(item.threadId||'legacy')!==id;})));
  } catch(e) {}
}

async function fetchAllOwnedChatRowsForDeletion(userId) {
  var rows=[],offset=0,pageSize=1000;
  while(offset<20000){
    var result=await sbFetch('chats?select=id,role,content,created_at&user_id=eq.'+encodeURIComponent(userId)+'&order=created_at.asc&limit='+pageSize+'&offset='+offset,'GET');
    if(!result||result.error||!Array.isArray(result.data))throw new Error('Could not read the complete conversation before deletion.');
    rows=rows.concat(result.data);
    if(result.data.length<pageSize)break;
    offset+=pageSize;
  }
  return rows;
}

async function deleteOwnedTopicChatRows(userId,id) {
  if(!userId||!SUPABASE_TOKEN)return true;
  if(chatOutboxFlushes&&chatOutboxFlushes[userId])await chatOutboxFlushes[userId];
  var remoteRows=await fetchAllOwnedChatRowsForDeletion(userId);
  var pending=typeof readChatOutbox==='function'?readChatOutbox(userId):[];
  var ids=remoteRows.concat(pending).filter(function(row){return row&&row.id&&decodeTopicChatRow(row).threadId===id;}).map(function(row){return row.id;});
  ids=ids.filter(function(value,index,self){return self.indexOf(value)===index;});
  for(var index=0;index<ids.length;index+=100){
    var chunk=ids.slice(index,index+100);
    var result=await sbFetch('chats?user_id=eq.'+encodeURIComponent(userId)+'&id=in.('+chunk.map(encodeURIComponent).join(',')+')','DELETE');
    if(!result||!result.ok)throw new Error('Conversation deletion failed ('+(result&&result.status||'network')+').');
  }
  if(typeof writeChatOutbox==='function')writeChatOutbox(userId,filterRowsOutsideTopicChat(pending,id));
  return true;
}

async function deleteTopicChat(id) {
  if(topicChatDeletionInFlight||isLoading||responseRegenerationInFlight)return false;
  var target=margChatThreads.find(function(thread){return thread.id===id;});
  if(!target)return false;
  topicChatDeletionInFlight=true;renderTopicChatToolbar();
  try {
    var userId=currentUser&&currentUser.id||'guest';
    await deleteOwnedTopicChatRows(userId,id);
    var wasActive=id===margActiveThreadId,oldIndex=margChatThreads.findIndex(function(thread){return thread.id===id;});
    if(!wasActive)captureActiveTopicChat();
    else {conversationHistory=[];if(typeof stopArticleRCTimer==='function')stopArticleRCTimer();}
    margAllChatMessages=filterRowsOutsideTopicChat(margAllChatMessages,id);
    margChatThreads=margChatThreads.filter(function(thread){return thread.id!==id;});
    delete margThreadStates[id];clearTopicChatLocalState(userId,id);
    if(!margChatThreads.length)margChatThreads.push({id:crypto.randomUUID(),title:'New chat'});
    if(wasActive){
      var next=margChatThreads[Math.min(Math.max(oldIndex,0),margChatThreads.length-1)];
      applyTopicChatState(next.id);
    } else {persistTopicChatIndex();renderTopicChatToolbar();}
    if(typeof closeAppMenu==='function')closeAppMenu();
    if(typeof showComposerStatus==='function')showComposerStatus('Chat deleted.','info',false);
    return true;
  } catch(error) {
    console.error('Chat deletion failed:',error);
    if(typeof showComposerStatus==='function')showComposerStatus('This chat could not be deleted. Check your connection and try again.','error',true);
    return false;
  } finally {topicChatDeletionInFlight=false;renderTopicChatToolbar();}
}

function requestDeleteTopicChat(id) {
  var thread=margChatThreads.find(function(item){return item.id===id;});
  if(!thread)return false;
  var accepted=typeof window==='undefined'||typeof window.confirm!=='function'||window.confirm('Delete “'+thread.title+'”? This permanently removes this chat and cannot be undone.');
  if(!accepted)return false;
  deleteTopicChat(id);return true;
}

function createTopicChat() {
  if(isLoading||responseRegenerationInFlight||topicChatDeletionInFlight)return false;
  var field=document.getElementById('new-chat-title'),title=String(field&&field.value||'').trim().slice(0,80);
  if(!title){if(field)field.focus();return false;}
  var id=crypto.randomUUID();margChatThreads.push({id:id,title:title});
  if(field)field.value='';closeTopicChatCreator();return switchTopicChat(id);
}

function createQuickTopicChat() {
  if(isLoading||responseRegenerationInFlight||topicChatDeletionInFlight)return false;
  var count=margChatThreads.filter(function(t){return /^New chat(?: \d+)?$/.test(t.title);}).length;
  var id=crypto.randomUUID(),title=count?'New chat '+(count+1):'New chat';
  margChatThreads.push({id:id,title:title});
  closeTopicChatCreator();return switchTopicChat(id);
}

function maybeRenameActiveTopicFromMessage(message) {
  var thread=margChatThreads.find(function(t){return t.id===margActiveThreadId;});
  if(!thread||!/^New chat(?: \d+)?$/.test(thread.title))return false;
  var title=String(message||'').replace(/\[[^\]]+\]/g,' ').replace(/\s+/g,' ').trim();
  if(!title)return false;
  title=title.split(' ').slice(0,7).join(' ');
  if(title.length>48)title=title.slice(0,47).trim()+'…';
  thread.title=title;
  captureActiveTopicChat();renderTopicChatToolbar();return true;
}

function openTopicChatFromSidebar(id){closeAppMenu();switchTab('chat');return switchTopicChat(id);}

function openTopicChatCreator(){var panel=document.getElementById('new-chat-panel');if(panel){panel.hidden=false;document.getElementById('new-chat-title').focus();}}
function closeTopicChatCreator(){var panel=document.getElementById('new-chat-panel');if(panel)panel.hidden=true;}

function getTopicChatMentorContext() {
  var thread=margChatThreads.find(function(t){return t.id===margActiveThreadId;});
  return thread?'\n\nCURRENT CONVERSATION: '+thread.title+'\nStay with the latest student message. Other topics share the student profile, not unanswered questions or exercise choices.':'';
}
