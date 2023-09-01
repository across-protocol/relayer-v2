import { clients, typeguards } from "@across-protocol/sdk-v2";
import { Event, providers } from "ethers";
import { getNetworkName } from "../utils";

// @dev Duplicated from @across-protocol/sdk-v2/src/clients/SpokePoolClient.ts
type _SpokePoolUpdate = {
  success: boolean;
  currentTime: number;
  firstDepositId: number;
  latestBlockNumber: number;
  latestDepositId: number;
  events: Event[][];
  blocks: { [blockNumber: number]: providers.Block };
  searchEndBlock: number;
};
type SpokePoolUpdate = { success: false } | _SpokePoolUpdate;

const maxTries = 5;

export class SpokePoolClient extends clients.SpokePoolClient {
  protected override async _update(eventsToQuery: string[]): Promise<SpokePoolUpdate> {
    const network = getNetworkName(this.chainId);
    let i: number;
    for (i = 0; i < maxTries; ++i) {
      try {
        return await super._update(eventsToQuery);
      } catch (err) {
        this.logger.info({
          at: "SpokePoolClient::_update",
          message: `Caught unhandled exception in SpokePoolClient::_update() on try ${i + 1}/${maxTries}.`,
          error: typeguards.isError(err) ? (err as Error).message : "Unknown error",
        });
      }
    }

    throw new Error(`Unable to update ${network} SpokePoolClient after ${i} attempts`);
  }
}
