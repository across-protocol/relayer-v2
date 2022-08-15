import { BigNumber, winston, assign, toBN } from "../../utils";
import { AdapterManager } from "./AdapterManager";
import { OutstandingTransfers } from "../../interfaces/Bridge";

export class CrossChainTransferClient {
  private outstandingCrossChainTransfers: { [chainId: number]: OutstandingTransfers } = {};

  constructor(
    readonly logger: winston.Logger,
    readonly chainIdList: number[],
    readonly adapterManager: AdapterManager
  ) {}

  // Get any funds currently in the canonical bridge.
  getOutstandingCrossChainTransferAmount(address: string, chainId: number | string, l1Token: string): BigNumber {
    const amount = this.outstandingCrossChainTransfers[Number(chainId)]?.[address]?.[l1Token]?.totalAmount;
    return amount ? toBN(amount) : toBN(0);
  }

  getOutstandingCrossChainTransferTxs(address: string, chainId: number | string, l1Token: string): string[] {
    const txHashes = this.outstandingCrossChainTransfers[Number(chainId)]?.[address]?.[l1Token]?.depositTxHashes;
    return txHashes ? txHashes : [];
  }

  getEnabledChains(): number[] {
    return this.chainIdList;
  }

  getEnabledL2Chains(): number[] {
    return this.getEnabledChains().filter((chainId) => chainId !== 1);
  }

  increaseOutstandingTransfer(address: string, l1Token: string, rebalance: BigNumber, chainId: number) {
    if (!this.outstandingCrossChainTransfers[chainId]) {
      this.outstandingCrossChainTransfers[chainId] = {};
    }
    const transfers = this.outstandingCrossChainTransfers[chainId];
    if (!transfers[address]) {
      transfers[address] = {};
    }

    // TODO: Require a tx hash here so we can track it as well.
    transfers[address][l1Token].totalAmount = this.getOutstandingCrossChainTransferAmount(
      address,
      chainId,
      l1Token
    ).add(rebalance);
  }

  async update(l1Tokens: string[]) {
    const monitoredChains = this.getEnabledL2Chains(); // Use all chainIds except L1.
    this.log("Updating cross chain transfers", { monitoredChains });

    const outstandingTransfersPerChain = await Promise.all(
      monitoredChains.map((chainId) =>
        this.adapterManager.getOutstandingCrossChainTokenTransferAmount(chainId, l1Tokens)
      )
    );
    outstandingTransfersPerChain.forEach((outstandingTransfers, index) => {
      assign(this.outstandingCrossChainTransfers, [monitoredChains[index]], outstandingTransfers);
    });

    this.log("Updated cross chain transfers", { outstandingCrossChainTransfers: this.outstandingCrossChainTransfers });
  }

  log(message: string, data?: any, level = "debug") {
    if (this.logger) this.logger[level]({ at: "CrossChainTransferClient", message, ...data });
  }
}
