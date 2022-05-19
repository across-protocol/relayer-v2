import { AugmentedTransaction } from "../clients";
import { winston, Contract, toBN, getContractInfoFromAddress, BigNumber } from "../utils";

// Note that this function will throw if the call to the contract on method for given args reverts. Implementers
// of this method should be considerate of this and catch the response to deal with the error accordingly.
export async function runTransaction(
  logger: winston.Logger,
  contract: Contract,
  method: string,
  args: any,
  value = BigNumber
) {
  try {
    const gas = await getGasPrice(contract.provider);
    logger.debug({ at: "TxUtil", message: "sending", target: getTarget(contract.address), method, args, gas, value });
    return await contract[method](...args, { ...gas, value });
  } catch (error) {
    logger.error({ at: "TxUtil", message: "Error executing tx", error });
    console.log(error);
    throw new Error(error.reason); // Extract the reason from the transaction error and throw it.
  }
}

//TODO: add in gasPrice when the SDK has this for the given chainId. TODO: improve how we fetch prices.
// For now this method will extract the provider's Fee data from the associated network and scale it by a priority
// scaler. This works on both mainnet and L2's by the utility switching the response structure accordingly.
export async function getGasPrice(provider, priorityScaler = toBN(1.2), maxFeePerGasScaler = 3) {
  const [feeData, chainInfo] = await Promise.all([provider.getFeeData(), provider.getNetwork()]);
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // Polygon, for some or other reason, does not correctly return an appropriate maxPriorityFeePerGas. Set the
    // maxPriorityFeePerGas to the maxFeePerGas * 5 for now as a temp workaround.
    if (chainInfo.chainId == 137) feeData.maxPriorityFeePerGas = feeData.maxFeePerGas.mul(2);
    return {
      maxFeePerGas: feeData.maxFeePerGas.mul(priorityScaler).mul(maxFeePerGasScaler), // scale up the maxFeePerGas. Any extra paid on this is refunded.
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(priorityScaler),
    };
  } else return { gasPrice: feeData.gasPrice.mul(priorityScaler) };
}

export async function willSucceed(
  transaction: AugmentedTransaction
): Promise<{ transaction: AugmentedTransaction; succeed: boolean; reason: string }> {
  try {
    await transaction.contract.callStatic[transaction.method](...transaction.args);
    return { transaction, succeed: true, reason: null };
  } catch (error) {
    console.error(error);
    return { transaction, succeed: false, reason: error.reason };
  }
}

export function getTarget(targetAddress: string) {
  try {
    return { targetAddress, ...getContractInfoFromAddress(targetAddress) };
  } catch (error) {
    return { targetAddress };
  }
}
