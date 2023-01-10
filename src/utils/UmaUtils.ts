import { Contract, ethers, isEventOlder, sortEventsDescending } from ".";
import * as uma from "@uma/contracts-node";
import { HubPoolClient } from "../clients";
import { ProposedRootBundle, SortableEvent } from "../interfaces";
import { BlockFinder } from "@uma/financial-templates-lib";

export async function getDvmContract(mainnetProvider: ethers.providers.Provider): Promise<Contract> {
  return new Contract(await uma.getVotingAddress(1), uma.getAbi("Voting"), mainnetProvider);
}
export async function getDisputedProposal(
  dvm: Contract,
  hubPoolClient: HubPoolClient,
  disputeRequestTimestamp: number,
  disputeRequestBlock?: number
): Promise<ProposedRootBundle> {
  const filter = dvm.filters.PriceRequestAdded();
  const blockFinder = new BlockFinder(dvm.provider.getBlock.bind(dvm.provider));
  const priceRequestBlock =
    disputeRequestBlock !== undefined
      ? disputeRequestBlock
      : (await blockFinder.getBlockForTimestamp(disputeRequestTimestamp)).number;
  const disputes = await dvm.queryFilter(filter, priceRequestBlock, priceRequestBlock);
  const dispute = disputes.find((e) => e.args.time.toString() === disputeRequestTimestamp.toString());
  if (!dispute) throw new Error("Could not find PriceRequestAdded event on DVM matching price request time");
  return sortEventsDescending(hubPoolClient.getProposedRootBundles()).find((e) =>
    isEventOlder(e as SortableEvent, dispute as SortableEvent)
  );
}
