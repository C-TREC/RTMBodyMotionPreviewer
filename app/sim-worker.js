// 模擬執行緒：以 RTM 1.12.2 的介面樁驅動「原封不動」的 RTMBodyMotion.js。
// 每次模擬都開新的 Worker，模組的全域狀態不會殘留。
// 輸入：{adapterSrc, moduleSrc, tuningSrc, payload:{cars, sub, switches, ticks}}
// 輸出：{poses: Float32Array(nt*sub*nc*5), tickSource, log, error}
"use strict";
self.onmessage = function (ev) {
  var msg = ev.data;
  var log = [];
  try {
    var result = run(msg, log);
    self.postMessage({ poses: result.poses, tickSource: result.tickSource, log: log }, [result.poses.buffer]);
  } catch (e) {
    self.postMessage({ error: String(e && e.stack ? e.stack : e), log: log });
  }
};

function run(msg, log) {
  var IN = msg.payload;
  var G = self;
  // ---- RTM／Minecraft 介面樁 ----
  G.RTMCore = { VERSION: "2.4.24" };
  var WORLD = { name: "world" };
  G.NGTUtil = { getMCVersion: function () { return "1.12.2"; }, getClientWorld: function () { return WORLD; } };
  G.NGTLog = { debug: function (m) { if (log.length < 200) log.push(String(m)); } };
  G.print = function (m) { G.NGTLog.debug(m); };

  var TRACK_Y = 64.0;
  function TileEntityLargeRailSwitchCore() {}
  G.TileEntityLargeRailSwitchCore = TileEntityLargeRailSwitchCore;
  var normalCore = { x: 0, y: 64, z: 0, getClass: function () { return { getName: function () { return "jp.ngt.rtm.rail.TileEntityLargeRailCore"; } }; } };
  var switches = (IN.switches || []).map(function (sw) {
    var core = new TileEntityLargeRailSwitchCore();
    core.x = sw.core[0]; core.y = TRACK_Y; core.z = sw.core[1];
    var point = {
      rpRoot: { posX: sw.root[0], posZ: sw.root[1] },
      rmMain: { getRailPos: function (s, i) { return [sw.main[i][0], sw.main[i][1]]; }, getRailRotation: function (s, i) { return sw.main[i][2]; } },
      rmBranch: { getRailPos: function (s, i) { return [sw.branch[i][0], sw.branch[i][1]]; }, getRailRotation: function (s, i) { return sw.branch[i][2]; } },
      branchDir: { id: sw.branchId }, mainDirIsPositive: sw.mainDirIsPositive, branchDirIsPositive: sw.branchDirIsPositive
    };
    core.getSwitch = function () { return { getPoints: function () { return [point]; } }; };
    return { core: core, box: sw.box };
  });
  function lookup(x, y, z) {
    if (Math.abs(y - TRACK_Y) > 0.5) return null;
    for (var i = 0; i < switches.length; i++) {
      var b = switches[i].box;
      if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]) { var c = switches[i].core; return { getRailCore: function () { return c; } }; }
    }
    return { getRailCore: function () { return normalCore; } };
  }
  G.TileEntityLargeRailBase = {
    getRailFromCoordinates: function (w, x, y, z, mode) {
      if (arguments.length != 5) throw new TypeError("no matching overload");
      return lookup(x, y, z);
    }
  };

  function classChain(names) { var c = null; for (var i = names.length - 1; i >= 0; i--) (function (n, s) { c = { getName: function () { return n; }, getSuperclass: function () { return s; } }; })(names[i], c); return c; }
  var PLAYER = classChain(["net.minecraft.client.entity.EntityOtherPlayerMP", "net.minecraft.entity.player.EntityPlayer", "net.minecraft.entity.EntityLivingBase"]);
  var NPC = classChain(["noppes.npcs.EntityCustomNpc", "net.minecraft.entity.EntityLivingBase"]);
  var worldEntities = [];
  G.MCWrapper = {
    getEntityId: function (o) { return o.id; },
    getPosX: function (o) { return o.x; }, getPosY: function (o) { return o.y; }, getPosZ: function (o) { return o.z; },
    getYaw: function (o) { return o.yaw; },
    getWorld: function () { return WORLD; },
    getEntities: function (w, x1, y1, z1, x2, y2, z2) {
      var hits = worldEntities.filter(function (o) { return o.x >= x1 && o.x <= x2 && o.y >= y1 && o.y <= y2 && o.z >= z1 && o.z <= z2; });
      return { size: function () { return hits.length; }, get: function (i) { return hits[i]; } };
    }
  };

  var bogieClass = { getName: function () { return "jp.ngt.rtm.entity.train.EntityBogie"; },
    getDeclaredField: function (n) { return { setAccessible: function () {}, get: function (b) { return b._core; } }; } };
  var trains = IN.cars.map(function (c) {
    var t = { id: c.id, x: 0, y: TRACK_Y, z: 0, yaw: 0, speed: 0, notch: 0, adjust: 0.0, half: c.half, field_70173_aa: 0 };
    t.getSpeed = function () { return this.speed; };
    t.getNotch = function () { return this.notch; };
    t.getTrainDirection = function () { return 0; };
    t.getResourceState = function () { var self = this; return {
      getDataMap: function () { return { getDouble: function () { return self.adjust; } }; },
      getResourceSet: function () { return { getConfig: function () { return { trainDistance: self.half }; } }; } }; };
    t.bogies = [{ x: 0, y: TRACK_Y, z: 0, rotationRoll: 0, _core: normalCore }, { x: 0, y: TRACK_Y, z: 0, rotationRoll: 0, _core: normalCore }];
    t.bogies.forEach(function (b) { b.getClass = function () { return bogieClass; }; });
    t.getBogie = function (i) { return this.bogies[i]; };
    return t;
  });

  // ---- 載入：調校值 → 平台適配器 → 模組（與遊戲內的載入順序相同）----
  (0, eval)("var MOTION_TUNING = " + (msg.tuningSrc && msg.tuningSrc.trim() ? msg.tuningSrc : "null") + ";");
  (0, eval)(msg.adapterSrc);
  (0, eval)(msg.moduleSrc);
  if (typeof G.motionGetPose !== "function") throw new Error("motionGetPose not found: the selected file is not RTMBodyMotion.js");
  var fakeNow = 1e12;
  G.motionNowNanos = function () { return fakeNow; };

  var sub = IN.sub, nc = trains.length, ticks = IN.ticks;
  var poses = new Float32Array(ticks.length * sub * nc * 5);
  var o = 0;
  for (var k = 0; k < ticks.length; k++) {
    var T = ticks[k];
    for (var i = 0; i < nc; i++) {
      var tr = trains[i], d = T.c[i];
      // d = [x, z, yaw, speedRaw, notch, adjust, b0x, b0z, b0roll, b1x, b1z, b1roll]
      tr.x = d[0]; tr.z = d[1]; tr.yaw = d[2]; tr.speed = d[3]; tr.notch = d[4]; tr.adjust = d[5];
      tr.bogies[0].x = d[6]; tr.bogies[0].z = d[7]; tr.bogies[0].rotationRoll = d[8];
      tr.bogies[1].x = d[9]; tr.bogies[1].z = d[10]; tr.bogies[1].rotationRoll = d[11];
      tr.field_70173_aa = k;
    }
    worldEntities = (T.e || []).map(function (e, n) {
      var cls = e[3] == 1 ? NPC : PLAYER;
      return { id: 1000 + n, x: e[0], y: TRACK_Y + e[1], z: e[2], getClass: function () { return cls; } };
    });
    for (var f = 0; f < sub; f++) {
      fakeNow = 1e12 + (k * 50.0 + f * 50.0 / sub) * 1e6;
      for (var j = 0; j < nc; j++) {
        var p = G.motionGetPose(trains[j], f / sub);
        poses[o++] = p.roll; poses[o++] = p.sway; poses[o++] = p.pitch; poses[o++] = p.shift; poses[o++] = p.bounce;
      }
    }
  }
  return { poses: poses, tickSource: String(G.motionTickSource) };
}
