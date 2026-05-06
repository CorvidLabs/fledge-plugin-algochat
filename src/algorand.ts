import algosdk from "algosdk";

const DEFAULT_ALGOD_URL = "http://localhost:4001";
const DEFAULT_ALGOD_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DEFAULT_INDEXER_URL = "http://localhost:8980";

function parseUrl(url: string): { base: string; port: string } {
  const parsed = new URL(url);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return { base: `${parsed.protocol}//${parsed.hostname}`, port };
}

let algodClient: algosdk.Algodv2 | null = null;
let indexerClient: algosdk.Indexer | null = null;

export function getAlgod(): algosdk.Algodv2 {
  if (!algodClient) {
    const url = process.env.ALGOD_URL ?? DEFAULT_ALGOD_URL;
    const token = process.env.ALGOD_TOKEN ?? DEFAULT_ALGOD_TOKEN;
    const { base, port } = parseUrl(url);
    algodClient = new algosdk.Algodv2(token, base, port);
  }
  return algodClient;
}

export function getIndexer(): algosdk.Indexer {
  if (!indexerClient) {
    const url = process.env.INDEXER_URL ?? DEFAULT_INDEXER_URL;
    const token = process.env.ALGOD_TOKEN ?? DEFAULT_ALGOD_TOKEN;
    const { base, port } = parseUrl(url);
    indexerClient = new algosdk.Indexer(token, base, port);
  }
  return indexerClient;
}

export async function checkAlgod(): Promise<boolean> {
  try {
    await getAlgod().status().do();
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestedParams(): Promise<algosdk.SuggestedParams> {
  return await getAlgod().getTransactionParams().do();
}

export async function submitAndWait(signedTxn: Uint8Array): Promise<string> {
  const algod = getAlgod();
  const { txid } = await algod.sendRawTransaction(signedTxn).do();
  await algosdk.waitForConfirmation(algod, txid, 4);
  return txid;
}
