import { MonitorConfig } from "./MonitorConfig";
import { Wallet, winston } from "../utils";
import { BundleDataClient, HubPoolClient, TokenTransferClient } from "../clients";
import { AdapterManager, CrossChainTransferClient } from "../clients/bridges";
import {
  Clients,
  updateClients,
  updateSpokePoolClients,
  constructClients,
  constructSpokePoolClientsWithLookback,
} from "../common";
import { SpokePoolClientsByChain } from "../interfaces";

export interface MonitorClients extends Clients {
  bundleDataClient: BundleDataClient;
  crossChainTransferClient: CrossChainTransferClient;
  hubPoolClient: HubPoolClient;
  spokePoolClients: SpokePoolClientsByChain;
  tokenTransferClient: TokenTransferClient;
}

export async function constructMonitorClients(
  config: MonitorConfig,
  logger: winston.Logger,
  baseSigner: Wallet
): Promise<MonitorClients> {
  const commonClients = await constructClients(logger, config, baseSigner);
  await updateClients(commonClients);

  // Construct spoke pool clients for all chains that are not *currently* disabled. Caller can override
  // the disabled chain list by setting the DISABLED_CHAINS_OVERRIDE environment variable.
  const spokePoolClients = await constructSpokePoolClientsWithLookback(
    logger,
    commonClients.hubPoolClient,
    commonClients.configStoreClient,
    config,
    baseSigner,
    config.maxRelayerLookBack
  );
  const bundleDataClient = new BundleDataClient(
    logger,
    commonClients,
    spokePoolClients,
    commonClients.configStoreClient.getChainIdIndicesForBlock(),
    config.blockRangeEndBlockBuffer
  );

  // Need to update HubPoolClient to get latest tokens.
  const spokePoolChains = Object.keys(spokePoolClients).map((chainId) => Number(chainId));
  const providerPerChain = Object.fromEntries(
    spokePoolChains.map((chainId) => [chainId, spokePoolClients[chainId].spokePool.provider])
  );
  const tokenTransferClient = new TokenTransferClient(logger, providerPerChain, config.monitoredRelayers);

  const spokePoolAddresses = Object.values(spokePoolClients).map((client) => client.spokePool.address);
  const adapterManager = new AdapterManager(
    logger,
    spokePoolClients,
    commonClients.hubPoolClient,
    [baseSigner.address, ...spokePoolAddresses],
    commonClients.hubPoolClient.hubPool.address
  );
  const crossChainTransferClient = new CrossChainTransferClient(logger, spokePoolChains, adapterManager);

  return { ...commonClients, bundleDataClient, crossChainTransferClient, spokePoolClients, tokenTransferClient };
}

export async function updateMonitorClients(clients: MonitorClients): Promise<void> {
  await updateSpokePoolClients(clients.spokePoolClients, [
    "FundsDeposited",
    "RequestedSpeedUpDeposit",
    "FilledRelay",
    "EnabledDepositRoute",
    "RelayedRootBundle",
    "ExecutedRelayerRefundRoot",
  ]);
  const allL1Tokens = clients.hubPoolClient.getL1Tokens().map((l1Token) => l1Token.address);
  await clients.crossChainTransferClient.update(allL1Tokens);
}
