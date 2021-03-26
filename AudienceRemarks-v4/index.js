// create Agora client
var client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

var localTracks = {
  videoTrack: null,
  audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: null,
  channel: null,
  uid: null,
  token: null,
  role: null
};

var rtc = {
  clientRtm: null,
  channelRtm: null
};

//uid for audience
var random = Math.floor( Math.random() * 99999 ) + 1;
//uid for host
var host = 55555;

// the demo can auto join channel with params in url
$(() => {
  var urlParams = new URL(location.href).searchParams;
  options.appid = urlParams.get("appid");
  options.channel = urlParams.get("channel");
  options.token = urlParams.get("token");
  options.role = urlParams.get("role");
  if (options.appid && options.channel) {
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
    $("#role:checked").val(options.role);
    $("#join-form").submit();
  }
})

$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  try {
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    options.channel = $("#channel").val();
    options.role = $("#role:checked").val();
    (options.role == "host") ? options.uid = host : options.uid = random;
    await join();
    joinRtm();
    if(options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      $("#success-alert a").attr("href", `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`);
      $("#success-alert").css("display", "block");
    }
   (options.role == "host") ? controlHost() : controlAudience();

  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
  }
})

$("#leave").click(function (e) {
  leave();
  logoutRtm();
})

$("#unmuteOfRemote").click(function (e) {
  console.log("unmuteOfRemote")
  unmuteOfRemote();
})

$("#muteOfRemote").click(function (e) {
  console.log("muteOfRemote")
  muteOfRemote();
})

$("#request").click(function (e) {
  console.log("request")
  request();
})


async function join() {

  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

/*
  // join a channel and create local tracks, we can use Promise.all to run them concurrently
  [options.uid, localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // join the channel
    client.join(options.appid, options.channel, options.token || null, options.uid),
    // create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);
*/
  // join the channel
  await client.join(options.appid, options.channel, options.token || null, options.uid);
  
  if(options.role == "host"){
    [localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
      // create local tracks, using microphone and camera
      AgoraRTC.createMicrophoneAudioTrack(),
      AgoraRTC.createCameraVideoTrack()
    ]);
    // play local video track
    localTracks.videoTrack.play("local-player");
    $("#local-player-name").text(`localVideo(${options.uid})`);
    // publish local stream
    // publish local tracks to channel
    await client.publish(Object.values(localTracks));
    console.log("publish success");
  }
}

async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if(track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  // remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // leave the channel
  await client.leave();

  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === 'video') {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === 'audio') {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user) {
  const id = user.uid;
  delete remoteUsers[id];
  $(`#player-wrapper-${id}`).remove();
}

async function doPublish(){
  [localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);
  // play local video track
  localTracks.videoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);
  // publish local stream
  // publish local tracks to channel
  await client.publish(Object.values(localTracks));
  console.log("publish success");
}

async function doUnPublish(){
  localTracks.videoTrack.stop("local-player");
  await client.unpublish(Object.values(localTracks));
  $("#local-player-name").text("");
}


function joinRtm () {
  //Create an Instance and Channel
  rtc.clientRtm = AgoraRTM.createInstance(options.appid);
  rtc.channelRtm = rtc.clientRtm.createChannel(options.channel);

  //Set a listener to the connection state change
  rtc.clientRtm.on("ConnectionStateChange", function (newState, reason) {
    console.log("on connection state changed to " + newState + " reason:" + reason);
  });
  //Log in the Agora RTM system
  rtc.clientRtm.login({uid: "" + options.uid}).then(function(){
    console.log("AgoraRTM client login success");
    rtc.channelRtm.join().then(function(){
      console.log("AgoraRTM client join success");
      receiveChannelMessage();
    }).catch(function (err){
      console.log("AgoraRTM client join failure, ", err);
    });
  }).catch(function(err){
    console.log("AgoraRTM client login failure, ", err);
  });
}


function logoutRtm(){
  rtc.clientRtm.logout(function(){
  console.log("AgoraRTM client logout success");
  });
}

function controlAudience () {
  $("#request").prop('disabled', false);
  $("#messageDisp").prop('disabled', true);
  $("#audienceId").prop('disabled', true);
  $("#muteOfRemote").prop('disabled', true);
  $("#unmuteOfRemote").prop('disabled', true);
}

function controlHost () {
  $("#request").prop('disabled', true);
  $("#messageDisp").prop('disabled', false);
  $("#audienceId").prop('disabled', false);
  $("#muteOfRemote").prop('disabled', false);
  $("#unmuteOfRemote").prop('disabled', false);
}

function add (id) {
  console.log("add: " + id);
  $('<option/>', {
   value: id,
   text: id,
  }).appendTo("#audienceId");
}

function remove (id) {
  console.log("remove: " + id);
  $('select#audienceId option[value=' + id + ']').remove();
}

function unmuteOfRemote () {
  options.audienceId = $("#audienceId").val();
  sendChannelMessage(prepMessage("unmuted",options.audienceId));
}

function muteOfRemote () {
  options.audienceId = $("#audienceId").val();
  sendChannelMessage(prepMessage("muted",options.audienceId));
}

function request () {
sendChannelMessage(prepMessage("requested",options.uid));
}

function permit (id) {
sendChannelMessage(prepMessage("permitted",id));
}

function deny (id) {
sendChannelMessage(prepMessage("denied",id));
}

function prepMessage(msg,id){
  return id + ":" + msg;
}

function sendChannelMessage(localMessage){
  setDispMessage(localMessage);
  rtc.channelRtm.sendMessage({text:localMessage}).then(function(){
console.log("AgoraRTM client succeed in sending channel message: " + localMessage);
  }).catch(function(err){
console.log("AgoraRTM client failed to sending role" + err);
  });
}

function setDispMessage(localMessage){
  currentMessage = $("#messageDisp").val();
  $("#messageDisp").val(currentMessage + localMessage + "\n")
}

function receiveChannelMessage(){

  rtc.channelRtm.on('MemberJoined', memberId => {
    console.log("AgoraRTM client is joined member: " + memberId);
    add(memberId);
  });

  rtc.channelRtm.on('MemberLeft', memberId => {
    console.log("AgoraRTM client is left member: " + memberId);
    remove(memberId);
  });

  rtc.channelRtm.on("ChannelMessage", function (sentMessage, senderId) {
    console.log("AgoraRTM client got message: " + JSON.stringify(sentMessage) + " from " + senderId);

    setDispMessage(sentMessage.text);
    console.log((sentMessage.text == senderId + ":requested") && (options.uid == host));
    if ((sentMessage.text == senderId + ":requested") && (options.uid == host)){
      var res = confirm("Are you sure " + senderId + " to be speaker?");
      (res == true) ? permit(senderId) : deny(senderId);
  
    }
    console.log(sentMessage.text == options.uid + ":permitted");
    if (sentMessage.text == options.uid + ":permitted"){
      doPublish();
    }

    console.log(sentMessage.text == options.uid + ":muted");
    if (sentMessage.text == options.uid + ":muted"){
      doUnPublish();
    }

    console.log(sentMessage.text == options.uid + ":unmuted");
    if (sentMessage.text == options.uid + ":unmuted"){
      doPublish();
    }

  });
}

