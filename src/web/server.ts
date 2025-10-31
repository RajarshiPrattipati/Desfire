import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import { spawn } from "child_process";
import NFCReaderManager from "../card/reader";
import DESFireCard from "../card/desfire";
import KeyManager, { KeyType } from "../card/keyManager";
import fs from "fs";

type CardInfo = {
  readerName?: string;
  present: boolean;
  uid?: string;
  atr?: string;
  type?: string;
  hardware?: string;
  software?: string;
  cardUidHex?: string;
  applications?: string[];
  freeMemory?: number;
  lastError?: string;
};

const app = express();
app.use(express.json());

const publicDir = path.join(__dirname, "../../public");
app.use(express.static(publicDir));

// Simple in-memory log broadcaster (SSE)
const LOG_LIMIT = 1000;
const logBuffer: string[] = [];
const sseClients = new Set<Response>();
const stamp = () => new Date().toISOString();
function pushLog(message: string) {
  const line = `[${stamp()}] ${message}`;
  logBuffer.push(line);
  if (logBuffer.length > LOG_LIMIT) logBuffer.shift();
  for (const res of sseClients) {
    try {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    } catch {}
  }
  // Also output to server console for local debugging
  // eslint-disable-next-line no-console
  console.log(line);
}

// Shared state
const readerManager = new NFCReaderManager();
let currentReader: any = null;
let lastCardInfo: CardInfo = { present: false };
const keyManager = new KeyManager("./keys");

// Initialize keystore master key
if (process.env.KEYSTORE_MASTER_PASSWORD) {
  keyManager.setMasterKey(process.env.KEYSTORE_MASTER_PASSWORD);
  pushLog("KeyManager: master key set from KEYSTORE_MASTER_PASSWORD");
} else if (process.env.KEYSTORE_MASTER_KEY_HEX) {
  try {
    const mk = Buffer.from(
      process.env.KEYSTORE_MASTER_KEY_HEX.replace(/\s+/g, ""),
      "hex"
    );
    keyManager.setMasterKey(mk);
    pushLog("KeyManager: master key set from KEYSTORE_MASTER_KEY_HEX");
  } catch {
    pushLog("KeyManager: failed to parse KEYSTORE_MASTER_KEY_HEX");
  }
} else {
  pushLog(
    "KeyManager: master key not set; saving/loading will be disabled until set"
  );
}

readerManager.on("reader-connected", (reader: any) => {
  currentReader = reader;
  lastCardInfo = {
    ...lastCardInfo,
    readerName: reader.reader.name,
    present: false,
    lastError: undefined,
  };
  pushLog(`Reader connected: ${reader.reader.name}`);
});

readerManager.on("reader-error", ({ error }: { reader: any; error: Error }) => {
  lastCardInfo.lastError = error?.message || String(error);
  pushLog(`Reader error: ${lastCardInfo.lastError}`);
});

readerManager.on("card-detected", async ({ reader, card }: any) => {
  pushLog(`Card detected on ${reader.reader.name}`);
  const info: CardInfo = {
    readerName: reader.reader.name,
    present: true,
    uid: card?.uid,
    atr: Buffer.isBuffer(card?.atr) ? card.atr.toString("hex") : undefined,
    type: card?.type,
    lastError: undefined,
  };

  try {
    // Extra delay to stabilize link on some readers
    await new Promise((r) => setTimeout(r, 350));

    const desfire = new DESFireCard(reader);

    // Try GetVersion with a few retries if the transport returns too-short frames
    let version: { hardware: Buffer; software: Buffer; uid: Buffer } | null =
      null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        version = await desfire.getVersion();
        break;
      } catch (e: any) {
        lastErr = e;
        const msg = (e?.message || "").toString();
        if (
          msg.includes("Invalid APDU response: too short") ||
          msg.includes("Transmission failed")
        ) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        throw e;
      }
    }

    if (version) {
      info.hardware = version.hardware?.toString("hex");
      info.software = version.software?.toString("hex");
      info.cardUidHex = version.uid?.toString("hex").toUpperCase();
    } else if (lastErr) {
      throw lastErr;
    }

    try {
      const aids = await desfire.getApplicationIDs();
      info.applications = aids.map(
        (aid) => "0x" + aid.toString(16).padStart(6, "0")
      );
    } catch {}

    try {
      const fm = await desfire.getFreeMemory();
      info.freeMemory = fm;
    } catch {}
  } catch (e: any) {
    info.lastError = e?.message || String(e);
    pushLog(`Card info error: ${info.lastError}`);
  }

  lastCardInfo = info;
});

readerManager.on("card-removed", () => {
  lastCardInfo.present = false;
  pushLog("Card removed");
});

// API: get status
app.get("/api/status", (_req, res) => {
  res.json({
    reader: lastCardInfo.readerName || null,
    card: lastCardInfo,
  });
});

// API: list npm scripts
app.get("/api/scripts", (_req, res) => {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts || {};
    res.json({ scripts });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// API: run npm script
app.post("/api/run-script", (req, res) => {
  const { script } = req.body || {};
  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "script is required" });
  }

  // Spawn npm run <script>
  const child = spawn(
    /^win/.test(process.platform) ? "npm.cmd" : "npm",
    ["run", script],
    {
      cwd: process.cwd(),
      env: process.env,
    }
  );

  let output = "";
  pushLog(`Starting script: npm run ${script} (pid ${child.pid})`);
  child.stdout.on("data", (d) => {
    const text = d.toString();
    output += text;
    text
      .split(/\r?\n/)
      .forEach((line: string) => line && pushLog(`[${script}] ${line}`));
  });
  child.stderr.on("data", (d) => {
    const text = d.toString();
    output += text;
    text
      .split(/\r?\n/)
      .forEach((line: string) => line && pushLog(`[${script}] ${line}`));
  });
  child.on("close", (code) => {
    pushLog(`Script finished: ${script} (exit ${code})`);
  });

  res.json({ pid: child.pid, started: true });
});

function requireMasterKey(): void {
  if (!(keyManager as any)["masterKey"]) {
    throw new Error(
      "Keystore master key not set. Configure KEYSTORE_MASTER_PASSWORD or KEYSTORE_MASTER_KEY_HEX"
    );
  }
}

// API: keys - list loaded keysets
app.get("/api/keys/list", (_req: Request, res: Response) => {
  const ids = keyManager
    .listKeySets()
    .map((id) => "0x" + id.toString(16).padStart(6, "0").toUpperCase());
  res.json({ apps: ids });
});

// API: keys - generate new keyset
app.post("/api/keys/generate", (req: Request, res: Response) => {
  const { appId, numKeys, keyType, save } = req.body || {};
  if (typeof appId !== "number")
    return res.status(400).json({ error: "appId (number) required" });
  const kt: KeyType = keyType === "DES" || keyType === "3DES" ? keyType : "AES";
  const ks = keyManager.generateKeySet(
    appId,
    Math.max(1, Math.min(Number(numKeys) || 5, 14)),
    kt
  );
  if (save) {
    try {
      requireMasterKey();
      keyManager.saveKeySet(appId);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || String(e) });
    }
  }
  pushLog(
    `KeySet generated for app 0x${appId.toString(16).padStart(6, "0")} [${kt}]`
  );
  res.json({ ok: true, appId: appId, keyType: kt });
});

// API: keys - save keyset
app.post("/api/keys/save", (req: Request, res: Response) => {
  try {
    requireMasterKey();
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || String(e) });
  }
  const { appId } = req.body || {};
  if (typeof appId !== "number")
    return res.status(400).json({ error: "appId (number) required" });
  try {
    keyManager.saveKeySet(appId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// API: keys - load keyset
app.post("/api/keys/load", (req: Request, res: Response) => {
  try {
    requireMasterKey();
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || String(e) });
  }
  const { appId } = req.body || {};
  if (typeof appId !== "number")
    return res.status(400).json({ error: "appId (number) required" });
  try {
    keyManager.loadKeySet(appId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// API: keys - show keyset (masked)
app.get("/api/keys/show", (req: Request, res: Response) => {
  const appIdStr = req.query.appId as string;
  const reveal = req.query.reveal === "1";
  if (!appIdStr) return res.status(400).json({ error: "appId required" });
  const appId = parseInt(appIdStr as string, 10);
  try {
    const ks = (keyManager as any).keySets.get(appId);
    if (!ks) return res.status(404).json({ error: "not_loaded" });
    const out: any = {
      appId: "0x" + appId.toString(16).padStart(6, "0"),
      keyType: ks.keyType,
      keys: {},
    };
    ks.keys.forEach((buf: Buffer, keyNo: number) => {
      const hex = buf.toString("hex");
      out.keys["K" + keyNo] = reveal
        ? hex
        : hex.length > 8
        ? hex.slice(0, 4) + "…" + hex.slice(-4)
        : "****";
    });
    res.json(out);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// API: authenticate application using keystore/env/manual
app.post("/api/app/auth", async (req: Request, res: Response) => {
  if (!currentReader || !lastCardInfo.present)
    return res.status(400).json({ error: "No card present" });
  const { aid, source, keyNo, keyHex, keyType, method } = req.body || {};
  if (typeof aid !== "number")
    return res.status(400).json({ error: "aid (number) required" });
  try {
    const desfire = new DESFireCard(currentReader);
    await desfire.selectApplication(aid);
    let buf: Buffer | null = null;
    let type: string | undefined = keyType;
    const no = typeof keyNo === "number" ? keyNo : 0;

    if (source === "keystore") {
      const ks = (keyManager as any).keySets.get(aid);
      if (!ks) throw new Error("Keyset not loaded for this AID");
      buf = ks.keys.get(no);
      type = ks.keyType;
    } else if (source === "manual") {
      if (!keyHex || !keyType)
        throw new Error("keyHex and keyType required for manual");
      buf = Buffer.from(keyHex.replace(/\s+/g, ""), "hex");
    } else if (source === "env") {
      const aidHex = aid.toString(16).padStart(6, "0").toUpperCase();
      const prefix = `DESFIRE_APP_${aidHex}`;
      const t = process.env[`${prefix}_KEY_TYPE`];
      const h = process.env[`${prefix}_KEY`];
      const n = process.env[`${prefix}_KEY_NO`]
        ? Number(process.env[`${prefix}_KEY_NO`])
        : 0;
      if (!t || !h) throw new Error("env key not set");
      type = t;
      buf = Buffer.from(h.replace(/\s+/g, ""), "hex");
    } else {
      throw new Error("unknown source");
    }

    if (!buf || !type) throw new Error("key not resolved");
    if (method === "AES_EV2" || type === "AES_EV2")
      await desfire.authenticateEV2First(no, buf);
    else if (type === "AES") await desfire.authenticateAES(no, buf);
    else await desfire.authenticateDES(no, buf);

    pushLog(
      `App 0x${aid
        .toString(16)
        .padStart(6, "0")} authenticated with K${no} (${type})`
    );
    res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    pushLog("App auth failed: " + msg);
    res.status(500).json({ error: msg });
  }
});
function getPiccKeyFromEnv(): {
  keyType: string;
  keyHex: string;
  keyNo: number;
} | null {
  const keyType = process.env.DESFIRE_PICC_KEY_TYPE;
  const keyHex = process.env.DESFIRE_PICC_KEY;
  const keyNo = process.env.DESFIRE_PICC_KEY_NO
    ? Number(process.env.DESFIRE_PICC_KEY_NO)
    : 0;
  if (keyType && keyHex) return { keyType, keyHex, keyNo };
  return null;
}

// API: erase/format card (PICC format)
app.post("/api/erase", async (req, res) => {
  if (!currentReader || !lastCardInfo.present) {
    return res.status(400).json({ error: "No card present" });
  }
  try {
    const desfire = new DESFireCard(currentReader);
    pushLog("Erase requested: Formatting PICC");
    // Always select PICC first
    await desfire.selectApplication(0x000000);

    // Resolve key (request body first, then env)
    let { keyType, keyHex, keyNo } = (req.body || {}) as {
      keyType?: string;
      keyHex?: string;
      keyNo?: number;
    };
    if (!keyType || !keyHex) {
      const envKey = getPiccKeyFromEnv();
      if (envKey) ({ keyType, keyHex, keyNo } = envKey);
    }

    // if (keyType && keyHex) {
    //   // If we have a key, authenticate first; no need for a failing attempt
    //   pushLog(`Authenticating PICC with provided key (${keyType})`);
    //   const keyBuf = Buffer.from(keyHex.replace(/\s+/g, ''), 'hex');
    //   if (keyType === 'DES' || keyType === '3DES') {
    //     await desfire.authenticateDES(keyNo ?? 0, keyBuf);
    //   } else if (keyType === 'AES') {
    //     await desfire.authenticateAES(keyNo ?? 0, keyBuf);
    //   } else if (keyType === 'AES_EV2') {
    //     await desfire.authenticateEV2First(keyNo ?? 0, keyBuf);
    //   } else {
    //     throw new Error('Unsupported keyType');
    //   }
    //   await desfire.formatPICC();
    //   pushLog('PICC formatted successfully');
    // } else {
    //   // No key provided: try unauthenticated format, then fallback to default DES
    //   try {
    //     await desfire.formatPICC();
    //     pushLog('PICC formatted successfully');
    //   } catch (e) {
    //     pushLog('Format denied, attempting default DES auth');
    //     await desfire.authenticateDES(0, Buffer.alloc(16, 0));
    //     await desfire.formatPICC();
    //     pushLog('PICC formatted after default auth');
    //   }
    try {
      await desfire.formatPICC();
      pushLog("PICC formatted successfully");
    } catch (e) {
      pushLog("Format denied, attempting default DES auth");
      await desfire.authenticateDES(0, Buffer.alloc(16, 0));
      await desfire.formatPICC();
      pushLog("PICC formatted after default auth");
    }
    lastCardInfo = { ...lastCardInfo, applications: [], freeMemory: undefined };
    res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    pushLog("Erase failed: " + msg);
    res.status(500).json({ error: msg });
  }
});

// API: SSE log stream
app.get("/api/logs", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Send last lines
  for (const line of logBuffer as string[]) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }
  sseClients.add(res);
  // Keepalive pings
  const iv = setInterval((): void => {
    try {
      res.write(": ping\n\n");
    } catch {}
  }, 20000);
  req.on("close", () => {
    clearInterval(iv);
    sseClients.delete(res);
  });
});

// API: authenticate PICC with provided key
app.post("/api/auth-picc", async (req: Request, res: Response) => {
  if (!currentReader || !lastCardInfo.present) {
    return res.status(400).json({ error: "No card present" });
  }
  const { keyType, keyHex, keyNo } = (req.body || {}) as {
    keyType?: string;
    keyHex?: string;
    keyNo?: number;
  };
  if (!keyType || !keyHex) {
    return res.status(400).json({ error: "keyType and keyHex are required" });
  }
  try {
    const desfire = new DESFireCard(currentReader);
    await desfire.selectApplication(0x000000);
    const keyBuf = Buffer.from(keyHex.replace(/\s+/g, ""), "hex");
    pushLog(`Authenticating PICC with ${keyType} (K${keyNo ?? 0})`);
    if (keyType === "DES" || keyType === "3DES") {
      await desfire.authenticateDES(keyNo ?? 0, keyBuf);
    } else if (keyType === "AES") {
      await desfire.authenticateAES(keyNo ?? 0, keyBuf);
    } else if (keyType === "AES_EV2") {
      await desfire.authenticateEV2First(keyNo ?? 0, keyBuf);
    } else {
      throw new Error("Unsupported keyType");
    }
    pushLog("PICC authentication successful");
    res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || String(e);
    pushLog("PICC authentication failed: " + msg);
    res.status(500).json({ error: msg });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3002;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Web UI running on http://localhost:${port}`);
});

// ==============================
// Payment Operations
// ==============================

const PAYMENT_AID = process.env.PAYMENT_AID
  ? parseInt(process.env.PAYMENT_AID, 16)
  : 0x000001;
const FILE_BALANCE = 0x00;
const FILE_TX_HISTORY = 0x01; // Std data file
const FILE_METADATA = 0x02; // Std data file
const TX_RECORD_SIZE = 24; // bytes: [type 1][amount 4][epochMs 8][balance 4][reserved 7]

async function withPaymentCard<T>(
  fn: (desfire: DESFireCard) => Promise<T>
): Promise<T> {
  if (!currentReader || !lastCardInfo.present)
    throw new Error("No card present");
  const desfire = new DESFireCard(currentReader);
  await desfire.selectApplication(PAYMENT_AID);
  return await fn(desfire);
}

function resolveAppKey(
  req: Request,
  aid: number
): { buf: Buffer; type: string; no: number } | null {
  const { source, keyNo, keyHex, keyType } = (req.body || {}) as any;
  const no = typeof keyNo === "number" ? keyNo : 0;
  if (source === "manual") {
    if (!keyHex || !keyType) throw new Error("manual keyType/keyHex required");
    return {
      buf: Buffer.from(keyHex.replace(/\s+/g, ""), "hex"),
      type: keyType,
      no,
    };
  }
  if (source === "env" || !source) {
    const aidHex = aid.toString(16).padStart(6, "0").toUpperCase();
    const prefix = `DESFIRE_APP_${aidHex}`;
    const t = process.env[`${prefix}_KEY_TYPE`];
    const h = process.env[`${prefix}_KEY`];
    const n = process.env[`${prefix}_KEY_NO`]
      ? Number(process.env[`${prefix}_KEY_NO`])
      : no;
    if (t && h)
      return { buf: Buffer.from(h.replace(/\s+/g, ""), "hex"), type: t, no: n };
  }
  // keystore not used here; could be added similarly
  return null;
}

async function ensureAuthForPayment(
  desfire: DESFireCard,
  req: Request,
  purpose: "read" | "write"
): Promise<void> {
  // Try env/manual app key first
  const resolved = resolveAppKey(req, PAYMENT_AID);
  if (resolved) {
    const { buf, type, no } = resolved;
    if (type === "AES_EV2") await desfire.authenticateEV2First(no, buf);
    else if (type === "AES") await desfire.authenticateAES(no, buf);
    else await desfire.authenticateDES(no, buf);
    return;
  }
  // If not provided, try default zeros (common on blank cards)
  try {
    await desfire.authenticateDES(0, Buffer.alloc(16, 0));
    return;
  } catch {}
  if (purpose === "read")
    throw new Error("Authentication required to read balance");
  throw new Error("Authentication required to modify balance");
}

async function readRecordCount(desfire: DESFireCard): Promise<number> {
  try {
    const buf = await desfire.readData(FILE_METADATA, 0, 4);
    if (buf.length >= 4) return buf.readUInt32LE(0);
  } catch {}
  return 0;
}

async function writeRecordCount(
  desfire: DESFireCard,
  count: number
): Promise<void> {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(count, 0);
  await desfire.writeData(FILE_METADATA, 0, b);
}

function buildTxRecord(
  type: number,
  amount: number,
  epochMs: bigint,
  balanceAfter: number
): Buffer {
  const buf = Buffer.alloc(TX_RECORD_SIZE, 0);
  buf.writeUInt8(type, 0);
  buf.writeInt32LE(amount, 1);
  // epochMs 8 bytes LE at offset 5
  const lo = Number(epochMs & BigInt(0xffffffff));
  const hi = Number((epochMs >> BigInt(32)) & BigInt(0xffffffff));
  buf.writeUInt32LE(lo, 5);
  buf.writeUInt32LE(hi, 9);
  buf.writeInt32LE(balanceAfter, 13);
  // reserved [17..23]
  return buf;
}

app.get("/api/payment/status", async (_req: Request, res: Response) => {
  try {
    const result = await withPaymentCard(async (desfire) => {
      // Try read balance (auth if env provided)
      let balance: number | null = null;
      try {
        await ensureAuthForPayment(desfire, _req as any, "read");
        balance = await desfire.getValue(FILE_BALANCE);
      } catch {}
      const count = await readRecordCount(desfire);
      return {
        aid: "0x" + PAYMENT_AID.toString(16).padStart(6, "0"),
        balance,
        records: count,
      };
    });
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

app.post("/api/payment/credit", async (req: Request, res: Response) => {
  const amount = Number((req.body || {}).amount || 0);
  if (!Number.isInteger(amount) || amount <= 0)
    return res.status(400).json({ error: "amount must be positive integer" });
  try {
    const result = await withPaymentCard(async (desfire) => {
      await ensureAuthForPayment(desfire, req, "write");
      // Read pre-balance for record
      let before = 0;
      try {
        before = await desfire.getValue(FILE_BALANCE);
      } catch {}
      await desfire.credit(FILE_BALANCE, amount);
      await desfire.commitTransaction();
      const after = before + amount;
      // Append transaction record
      const count = await readRecordCount(desfire);
      const offset = count * TX_RECORD_SIZE;
      const rec = buildTxRecord(0, amount, BigInt(Date.now()), after);
      await desfire.writeData(FILE_TX_HISTORY, offset, rec);
      await writeRecordCount(desfire, count + 1);
      return { ok: true, balance: after, records: count + 1 };
    });
    pushLog(`Payment credit ${amount} applied`);
    res.json(result);
  } catch (e: any) {
    const msg = e?.message || String(e);
    pushLog("Payment credit failed: " + msg);
    res.status(400).json({ error: msg });
  }
});

app.post("/api/payment/debit", async (req: Request, res: Response) => {
  const amount = Number((req.body || {}).amount || 0);
  if (!Number.isInteger(amount) || amount <= 0)
    return res.status(400).json({ error: "amount must be positive integer" });
  try {
    const result = await withPaymentCard(async (desfire) => {
      await ensureAuthForPayment(desfire, req, "write");
      const before = await desfire.getValue(FILE_BALANCE);
      if (before < amount) throw new Error("Insufficient funds");
      await desfire.debit(FILE_BALANCE, amount);
      await desfire.commitTransaction();
      const after = before - amount;
      const count = await readRecordCount(desfire);
      const offset = count * TX_RECORD_SIZE;
      const rec = buildTxRecord(1, amount, BigInt(Date.now()), after);
      await desfire.writeData(FILE_TX_HISTORY, offset, rec);
      await writeRecordCount(desfire, count + 1);
      return { ok: true, balance: after, records: count + 1 };
    });
    pushLog(`Payment debit ${amount} applied`);
    res.json(result);
  } catch (e: any) {
    const msg = e?.message || String(e);
    pushLog("Payment debit failed: " + msg);
    res.status(400).json({ error: msg });
  }
});
