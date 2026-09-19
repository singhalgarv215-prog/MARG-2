/* Topic organisation uses the existing owned chats rows, not a second transcript.
 * Metadata is removed before rendering or sending messages to the mentor. */
var margChatThreads = [], margAllChatMessages = [], margActiveThreadId = 'legacy';
var margThreadOwner = null, margThreadStates = {};

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

function captureActiveTopicChat() {
  if(margThreadOwner!==(currentUser&&currentUser.id||'guest'))return;
  conversationHistory.forEach(function(item){item.threadId=item.threadId||margActiveThreadId;});
  margAllChatMessages=margAllChatMessages.filter(function(item){return item.threadId!==margActiveThreadId;}).concat(conversationHistory);
  margThreadStates[margActiveThreadId]={exercise:typeof activeGeneratedExercise!=='undefined'?activeGeneratedExercise:null,failed:typeof lastFailedOutgoingMessage!=='undefined'?lastFailedOutgoingMessage:null,diagnostic:typeof chatDiagnosticState!=='undefined'?chatDiagnosticState:null,flow:typeof diagnosticFlowState!=='undefined'?diagnosticFlowState:null};
  margThreadStates[margActiveThreadId].mockPriority=typeof activeMockReviewPriority!=='undefined'?activeMockReviewPriority:'';
  margThreadStates[margActiveThreadId].mockSource=typeof activeMockReviewSource!=='undefined'?activeMockReviewSource:'';
  margThreadStates[margActiveThreadId].diagnosticTopic=typeof activeDiagnosticTopic!=='undefined'?activeDiagnosticTopic:null;
  try{localStorage.setItem(topicChatStorageKey(),JSON.stringify({active:margActiveThreadId,threads:margChatThreads}));}catch(e){}
}

function initialiseTopicChats(rows) {
  margThreadOwner=currentUser&&currentUser.id||'guest';margThreadStates={};margAllChatMessages=(rows||[]).map(decodeTopicChatRow);
  var saved={};try{saved=JSON.parse(localStorage.getItem(topicChatStorageKey())||'{}')||{};}catch(e){}
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
  var button=document.getElementById('new-topic-chat');if(button)button.disabled=!!isLoading;
  var lists=[document.getElementById('desktop-chat-list'),document.getElementById('mobile-chat-list')];
  var html=margChatThreads.slice().reverse().map(function(t){
    var active=t.id===margActiveThreadId?' active':'';
    return '<button type="button" class="sidebar-chat-item'+active+'" onclick="openTopicChatFromSidebar(\''+escapeChatHtml(t.id)+'\')" aria-current="'+(active?'page':'false')+'"><span class="sidebar-chat-title">'+escapeChatHtml(t.title)+'</span></button>';
  }).join('');
  lists.forEach(function(list){if(list)list.innerHTML=html;});
}

function switchTopicChat(id) {
  if(isLoading||responseRegenerationInFlight){renderTopicChatToolbar();return false;}
  if(!margChatThreads.some(function(t){return t.id===id;})||id===margActiveThreadId){renderTopicChatToolbar();return false;}
  saveCurrentChatDraft();captureActiveTopicChat();margActiveThreadId=id;
  var input=document.getElementById('user-input');if(input){input.value='';input.style.height='auto';}
  conversationHistory=margAllChatMessages.filter(function(item){return item.threadId===id;});
  var state=margThreadStates[id]||{};
  if(typeof activeMockReviewPriority!=='undefined')activeMockReviewPriority=state.mockPriority||'';
  if(typeof activeMockReviewSource!=='undefined')activeMockReviewSource=state.mockSource||'';
  if(typeof activeDiagnosticTopic!=='undefined')activeDiagnosticTopic=state.diagnosticTopic||null;
  activeGeneratedExercise=state.exercise||null;lastFailedOutgoingMessage=state.failed||null;
  // Never carry a pending choice/diagnostic from a different conversation.
  if(typeof pendingExternalQuestion!=='undefined')pendingExternalQuestion=null;
  if(typeof chatDiagnosticState!=='undefined')chatDiagnosticState=state.diagnostic||{active:false,topic:null,subcategory:null,pattern:null,rejectedCount:0};
  if(typeof diagnosticFlowState!=='undefined')diagnosticFlowState=state.flow||{active:false,firstTime:false,topic:null,subcategory:null,pattern:null,stage:'root'};
  if(typeof pendingDiagnosticExercise!=='undefined')pendingDiagnosticExercise=null;
  if(typeof pendingExternalQuestionTurnMode!=='undefined')pendingExternalQuestionTurnMode='';
  if(typeof guidedGenerationState!=='undefined')guidedGenerationState=null;
  pendingImageAttachments=[];queuedOutgoingMessage=null;
  if(typeof renderPendingImageAttachments==='function')renderPendingImageAttachments();
  var messages=document.getElementById('messages');if(messages)messages.innerHTML='';
  captureActiveTopicChat();restoreConversation();renderTopicChatToolbar();return true;
}

function createTopicChat() {
  if(isLoading||responseRegenerationInFlight)return false;
  var field=document.getElementById('new-chat-title'),title=String(field&&field.value||'').trim().slice(0,80);
  if(!title){if(field)field.focus();return false;}
  var id=crypto.randomUUID();margChatThreads.push({id:id,title:title});
  if(field)field.value='';closeTopicChatCreator();return switchTopicChat(id);
}

function createQuickTopicChat() {
  if(isLoading||responseRegenerationInFlight)return false;
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
