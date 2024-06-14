import {
  Contract,
  BigNumber,
  paginatedEventQuery,
  Signer,
  EventSearchConfig,
  Provider,
  spreadEventWithBlockNumber,
  BigNumberish,
} from "../../../utils";
import { CONTRACT_ADDRESSES, CUSTOM_ARBITRUM_GATEWAYS } from "../../../common";
import { SortableEvent } from "../../../interfaces";
import { BridgeTransactionDetails, BaseBridgeAdapter, BridgeEvents } from "./BaseBridgeAdapter";
import { Event } from "ethers";

const DEFAULT_ERC20_GATEWAY = {
  l1: "0xa3A7B6F88361F48403514059F1F16C8E78d60EeC",
  l2: "0x09e9222E96E7B4AE2a407B98d48e330053351EEe",
};

export class ArbitrumBridge extends BaseBridgeAdapter {
  private readonly l1Bridge: Contract;
  private readonly l2Bridge: Contract;

  constructor(
    l2chainId: number,
    hubChainId: number,
    l1Signer: Signer,
    l2SignerOrProvider: Signer | Provider,
    l1Token: string
  ) {
    const { address: gatewayAddress, abi: l1Abi } = CONTRACT_ADDRESSES[hubChainId].arbitrumErc20GatewayRouter;
    const { l1: l1Address, l2: l2Address } = CUSTOM_ARBITRUM_GATEWAYS[l1Token] ?? DEFAULT_ERC20_GATEWAY;
    const l2Abi = CONTRACT_ADDRESSES[l2chainId].arbitrumErc20Gateway.abi;

    super(l2chainId, hubChainId, l1Signer, l2SignerOrProvider, [gatewayAddress]);

    this.l1Bridge = new Contract(l1Address, l1Abi, l1Signer);
    this.l2Bridge = new Contract(l2Address, l2Abi, l2SignerOrProvider);
  }

  constructL1ToL2Txn(
    toAddress: string,
    l1Token: string,
    l2Token: string,
    amount: BigNumber,
    l2Gas: number
  ): BridgeTransactionDetails {
    return {
      contract: this.l1Bridge,
      method: "depositERC20",
      args: [l1Token, l2Token, amount, l2Gas, "0x"],
    };
  }

  async queryL1BridgeInitiationEvents(
    l1Token: string,
    fromAddress: string,
    eventConfig: EventSearchConfig
  ): Promise<BridgeEvents> {
    const events = await paginatedEventQuery(
      this.l1Bridge,
      this.l1Bridge.filters.DepositInitiated(l1Token, undefined, fromAddress),
      eventConfig
    );
    const processEvent = (event: Event) => {
      const eventSpread = spreadEventWithBlockNumber(event) as SortableEvent & {
        amount: BigNumberish;
        to: string;
        from: string;
        transactionHash: string;
      };
      return {
        amount: eventSpread["_amount"],
        to: eventSpread["_to"],
        from: eventSpread["_from"],
        transactionHash: eventSpread.transactionHash,
      };
    };
    return {
      [this.resolveL2TokenAddress(l1Token)]: events.map(processEvent),
    };
  }

  async queryL2BridgeFinalizationEvents(
    l1Token: string,
    fromAddress: string,
    eventConfig: EventSearchConfig
  ): Promise<BridgeEvents> {
    const events = await paginatedEventQuery(
      this.l1Bridge,
      this.l1Bridge.filters.DepositFinalized(l1Token, undefined, fromAddress),
      eventConfig
    );
    const processEvent = (event: Event) => {
      const eventSpread = spreadEventWithBlockNumber(event) as SortableEvent & {
        amount: BigNumberish;
        to: string;
        from: string;
        transactionHash: string;
      };
      return {
        amount: eventSpread["_amount"],
        to: eventSpread["_to"],
        from: eventSpread["_from"],
        transactionHash: eventSpread.transactionHash,
      };
    };
    return {
      [this.resolveL2TokenAddress(l1Token)]: events.map(processEvent),
    };
  }
}
