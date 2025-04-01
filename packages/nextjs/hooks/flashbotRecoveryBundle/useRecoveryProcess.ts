import { useCallback, useEffect, useState } from "react";
import { useShowError } from "./useShowError";
import { AlchemyProvider, JsonRpcProvider } from "@ethersproject/providers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BigNumber, ethers } from "ethers";
import { useLocalStorage } from "usehooks-ts";
import { v4 } from "uuid";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import * as chains from "wagmi/chains";
import scaffoldConfig from "~~/scaffold.config";
import { ERC20Tx, ERC721Tx, ERC1155Tx, RecoveryTx } from "~~/types/business";
import { RecoveryProcessStatus } from "~~/types/enums";
import { ERC20_ABI, ERC721_ABI, ERC1155_ABI } from "~~/utils/constants";
import { getNetworkConfig, getTargetNetwork } from "~~/utils/scaffold-eth";

const erc721Interface = new ethers.utils.Interface(ERC721_ABI);
const erc1155Interface = new ethers.utils.Interface(ERC1155_ABI);
const erc20Interface = new ethers.utils.Interface(ERC20_ABI);

interface IStartProcessProps {
  safeAddress: string;
  hackedAddress: string;
  transactions: RecoveryTx[];
  currentBundleId: string;
}

interface IChangeRPCProps {
  modifyBundleId: (bundleId: string) => void;
  setRpcParams: (params: any) => void;
}

const flashbotSigner = ethers.Wallet.createRandom();

export const useRecoveryProcess = () => {
  const targetNetwork = getTargetNetwork();
  const networkConfig = getNetworkConfig(targetNetwork);
  const [flashbotsProvider, setFlashbotsProvider] = useState<FlashbotsBundleProvider>();
  const [mainnetProvider, setMainnetProvider] = useState<AlchemyProvider | JsonRpcProvider>();
  const [gasCovered, setGasCovered] = useState<boolean>(false);
  const [sentTxHash, setSentTxHash] = useLocalStorage<string>("sentTxHash", "");
  const [sentBlock, setSentBlock] = useLocalStorage<number>("sentBlock", 0);
  const [attemptedBlock, setAttemptedBlock] = useLocalStorage<number>("attemptedBlock", 0);
  const { showError } = useShowError();

  const [stepActive, setStepActive] = useState<RecoveryProcessStatus>(RecoveryProcessStatus.INITIAL);
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { address } = useAccount();

  const { data: walletClient } = useWalletClient();

  const [unsignedTxs, setUnsignedTxs] = useLocalStorage<RecoveryTx[]>("unsignedTxs", []);
  const [gasMultiplier, setGasMultiplier] = useLocalStorage<number>("gasMultiplier", 1);
  const [customizedGasEstimate, setCustomizedGasEstimate] = useState<BigNumber>(BigNumber.from(0));

  useEffect(() => {
    (async () => {
      if (!targetNetwork || !targetNetwork.blockExplorers) return;

      // Create provider based on network
      const provider =
        targetNetwork.id === chains.sepolia.id
          ? new ethers.providers.JsonRpcProvider(
              `https://eth-sepolia.g.alchemy.com/v2/${scaffoldConfig.alchemyApiKey2 || scaffoldConfig.alchemyApiKey}`,
            )
          : new ethers.providers.AlchemyProvider(
              targetNetwork.id,
              scaffoldConfig.alchemyApiKey2 || scaffoldConfig.alchemyApiKey,
            );

      setMainnetProvider(provider);
      setFlashbotsProvider(
        await FlashbotsBundleProvider.create(
          provider,
          flashbotSigner,
          networkConfig.relayUrl,
          targetNetwork.id === chains.sepolia.id ? "sepolia" : undefined,
        ),
      );
    })();
  }, []);

  const resetStatus = () => {
    setStepActive(RecoveryProcessStatus.INITIAL);
  };
  const validateBundleIsReady = () => {
    console.log("Validate bundle is ready");
    if (gasCovered) {
      console.log("Gas covered");
      setStepActive(RecoveryProcessStatus.GAS_PAID);
      return false;
    }

    ////////// Enforce switching to the safe address
    if (!address) {
      console.log("No connected account");
      setStepActive(RecoveryProcessStatus.NO_CONNECTED_ACCOUNT);
      return false;
    }
    console.log("Gas not covered");
    return true;
  };

  const calculateCustomizedGasEstimate = useCallback((transactions: RecoveryTx[], multiplier: number) => {
    let totalFee = BigInt(0);

    for (const tx of transactions) {
      if (tx.toSign) {
        // Apply multiplier to the fee per gas first
        const txFeePerGas = (BigInt(tx.toSign?.maxFeePerGas || 0) * BigInt(Math.floor(multiplier * 100))) / BigInt(100);
        const txGas = BigInt(tx.toSign?.gas || 0);
        // Calculate fee for this individual transaction
        const txFee = txFeePerGas * txGas;
        totalFee += txFee;
      }
    }

    // Add 1% buffer to the total
    totalFee = (totalFee * BigInt(101)) / BigInt(100);
    setCustomizedGasEstimate(BigNumber.from(totalFee.toString()));
    return totalFee;
  }, []);

  const changeFlashbotNetwork = async ({ modifyBundleId, setRpcParams }: IChangeRPCProps) => {
    const bundleId = v4();
    const { result, params } = await addRelayRPC(bundleId);
    modifyBundleId(bundleId);
    if (!result) {
      setRpcParams(params);
      return false;
    }
    // Move to gas customization step instead of directly to signing
    setStepActive(RecoveryProcessStatus.CUSTOMIZE_GAS);
    return true;
  };

  const getEstimatedTxFees = async () => {
    const block = await mainnetProvider?.getBlock("latest");
    if (block) {
      const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(
        block.baseFeePerGas as BigNumber,
        3,
      ).toString();
      const priorityFee = BigNumber.from(3).mul(1e9).toString(); // 3 Gwei
      // Buffer the max base fee by 15%
      const adjustedMaxBaseFeeInFutureBlock = BigNumber.from(maxBaseFeeInFutureBlock).mul(120).div(100).toString();
      return { maxBaseFeeInFutureBlock: adjustedMaxBaseFeeInFutureBlock, priorityFee };
    }
    return { maxBaseFeeInFutureBlock: "0", priorityFee: "0" };
  };

  const payTheGas = async (transactions: RecoveryTx[], hackedAddress: string, multiplier: number) => {
    // Calculate the total fee by summing individual transaction fees
    let totalFee = BigInt(0);
    
    for (const tx of transactions) {
      if (tx.toSign) {
        const txFeePerGas = BigInt(tx.toSign?.maxFeePerGas || 0) * BigInt(Math.floor(multiplier * 100)) / BigInt(100);
        const txGas = BigInt(tx.toSign?.gas || 0);
        // Calculate fee for this individual transaction
        const txFee = txFeePerGas * txGas;
        totalFee += txFee;
      }
    }
    
    // Add one percent for good measure
    totalFee = (totalFee * BigInt(101)) / BigInt(100);
    console.log("DEBUG: totalFee", totalFee);
    
    const { maxBaseFeeInFutureBlock, priorityFee } = await getEstimatedTxFees();
    await walletClient?.sendTransaction({
      to: hackedAddress as `0x${string}`,
      value: totalFee,
      type: "eip1559",
      maxFeePerGas:
        ((BigInt(priorityFee) + BigInt(maxBaseFeeInFutureBlock)) * BigInt(Math.floor(multiplier * 100))) / BigInt(100),
      maxPriorityFeePerGas: (BigInt(priorityFee) * BigInt(Math.floor(multiplier * 100))) / BigInt(100),
      gas: 23000n,
    });
    setGasCovered(true);
  };

  const signRecoveryTransactions = async (
    hackedAddress: string,
    transactions: RecoveryTx[],
    currentBundleId: string,
    surpass = false,
  ) => {
    if (!surpass && !gasCovered) {
      showError("How did you come here without covering the gas fee first??");
      resetStatus();
      return;
    }

    ////////// Enforce switching to the hacked address
    if (address != hackedAddress) {
      console.log("DEBUG: switching to hacked address");
      setStepActive(RecoveryProcessStatus.SWITCH_TO_HACKED_ACCOUNT);
      return;
    }
    setStepActive(RecoveryProcessStatus.SIGN_RECOVERY_TXS);
    ////////// Sign the transactions in the basket one after another
    try {
      for (const tx of transactions) {
        if (tx.toSign) {
          // In signRecoveryTransactions
          // Numbers are stored as strings so we need to convert to BigInts
          const { to, from, data, type, gas } = tx.toSign;
          let { maxFeePerGas, maxPriorityFeePerGas } = tx.toSign;
          console.log("DEBUG: maxFeePerGas to sign", maxFeePerGas);
          console.log("DEBUG: maxPriorityFeePerGas to sign", maxPriorityFeePerGas);
          console.log("DEBUG: applying multiplier to gas fees");
          maxFeePerGas = (BigInt(maxFeePerGas as string) * BigInt(Math.floor(gasMultiplier * 100))) / BigInt(100);
          maxPriorityFeePerGas =
            (BigInt(maxPriorityFeePerGas as string) * BigInt(Math.floor(gasMultiplier * 100))) / BigInt(100);
          console.log("DEBUG: maxFeePerGas to sign after multiplier", maxFeePerGas);
          console.log("DEBUG: maxPriorityFeePerGas to sign after multiplier", maxPriorityFeePerGas);
          const readyToSignTx = {
            to,
            from,
            data,
            type,
            maxFeePerGas,
            maxPriorityFeePerGas,
            gas: BigInt(gas as string),
          };
          await walletClient?.sendTransaction(readyToSignTx);
        }
      }
      setGasCovered(false);

      // Instead of sending the bundle immediately, move to confirmation step
      setStepActive(RecoveryProcessStatus.CONFIRM_BUNDLE);
    } catch (e) {
      showError(`FAILED TO SIGN TXS Error: ${e}`);
      resetStatus();
    }
  };

  const sendBundle = async (currentBundleId: string, targetBlock?: number) => {
    if (!flashbotsProvider) {
      showError("Flashbot provider not available");
      resetStatus();
      return;
    }
    setStepActive(RecoveryProcessStatus.SEND_BUNDLE);
    try {
      const finalBundle = await (
        await fetch(`${networkConfig.bundleCacheApiUrl}/bundle?id=${currentBundleId}`, {
          cache: "no-store",
        })
      ).json();

      if (!finalBundle || !finalBundle.rawTxs) {
        showError("Couldn't fetch latest bundle");
        resetStatus();
        return;
      }

      const txs = finalBundle.rawTxs.reverse();

      try {
        setStepActive(RecoveryProcessStatus.LISTEN_BUNDLE);
        setSentTxHash(ethers.utils.keccak256(txs[0]));
        setSentBlock(parseInt((await publicClient.getBlockNumber()).toString()));

        const currentUrl = window.location.href.replace("?", "");
        while (true) {
          // If targetBlock is specified and we haven't reached it yet, wait
          const currentBlock = parseInt((await publicClient.getBlockNumber()).toString());
          
          if (targetBlock && currentBlock < targetBlock - 1) {
            // Set the attempted block to the target block
            setAttemptedBlock(targetBlock);
            
            // Wait for approximately one block time before checking again
            await new Promise(resolve => setTimeout(resolve, 12000));
            continue;
          }
          
          // Use the target block if specified, otherwise use current block + 2
          const blockToTarget = targetBlock || currentBlock + 2;
          setAttemptedBlock(blockToTarget);
          
          const response = await fetch(currentUrl + `api/relay`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-network-id": targetNetwork.id.toString(),
              "x-target-block": blockToTarget.toString(), // Add target block to headers
            },
            body: JSON.stringify({
              txs,
              targetBlock: blockToTarget, // Include target block in request body
            }),
            cache: "no-store",
          });

          const parsedResponse = await response.json();
          // Success
          if (parsedResponse.success) {
            setStepActive(RecoveryProcessStatus.SUCCESS);
            break;
          }
          // Error
          if (!parsedResponse.success && parsedResponse.response.includes("Bundle reverted with error")) {
            showError(
              `${parsedResponse.message}.\n The recovery has failed. To solve this issue, remove all "Hacked Wallet Recovery RPC" and clear activity data. Check this <a href="https://youtu.be/G4dg74m_Bmc" target="_blank" rel="noopener noreferrer">video</a>`,
              true,
            );
            setSentTxHash("");
            setSentBlock(0);
            resetStatus();
            break;
          }
          // BlockPassedWithoutInclusion - try again with next block
          if (targetBlock) {
            // If we specified a target block but it passed without inclusion,
            // increment the target block for the next attempt
            targetBlock++;
          }
        }
      } catch (e) {
        console.error(e);
        setSentTxHash("");
        setSentBlock(0);
        showError("Error submitting bundles. Check console for details.");
        resetStatus();
      }
    } catch (e) {
      console.error(e);
      setSentTxHash("");
      setSentBlock(0);
      showError("Error submitting bundles. Check console for details.");
      resetStatus();
    }
  };

  const generateCorrectTransactions = ({
    transactions,
    safeAddress,
    hackedAddress,
  }: {
    transactions: RecoveryTx[];
    safeAddress: string;
    hackedAddress: string;
  }): RecoveryTx[] => {
    const result: RecoveryTx[] = [];
    for (const item of transactions) {
      let newTX: RecoveryTx = { ...item };
      console.log("DEBUG: item type", item.type);
      if (item.type === "erc20") {
        const data = item as ERC20Tx;
        newTX = {
          type: data.type,
          info: data.info,
          symbol: data.symbol,
          amount: data.amount,
          toEstimate: {
            from: data.toEstimate.from,
            to: data.toEstimate.to,
            data: erc20Interface.encodeFunctionData("transfer", [
              safeAddress,
              BigNumber.from(data.amount),
            ]) as `0x${string}`,
          },
        };
      }

      if (item.type === "erc721") {
        const data = item as ERC721Tx;
        newTX = {
          type: data.type,
          info: data.info,
          symbol: data.symbol,
          tokenId: data.tokenId,
          toEstimate: {
            from: data.toEstimate.from,
            to: data.toEstimate.to,
            data: erc721Interface.encodeFunctionData("transferFrom", [
              data.toEstimate.from,
              safeAddress,
              BigNumber.from(data.tokenId),
            ]) as `0x${string}`,
          },
        };
      }

      if (item.type === "erc1155") {
        const data = item as ERC1155Tx;
        newTX = {
          type: data.type,
          info: data.info,
          //@ts-ignore
          uri: data.uri,
          tokenIds: data.tokenIds,
          amounts: data.amounts,
          toEstimate: {
            from: data.toEstimate.from,
            to: data.toEstimate.to,
            data: erc1155Interface.encodeFunctionData("safeBatchTransferFrom", [
              hackedAddress,
              safeAddress,
              data.tokenIds,
              data.amounts,
              ethers.constants.HashZero,
            ]) as `0x${string}`,
          },
        };
      }
      result.push(newTX);
    }
    return result;
  };

  const startRecoveryProcess = async ({
    currentBundleId,
    hackedAddress,
    transactions,
    modifyBundleId,
    setRpcParams,
  }: IStartProcessProps & IChangeRPCProps) => {
    console.log("Start recovery process");
    const isValid = validateBundleIsReady();
    console.log("Validate bundle is ready", isValid);
    if (!isValid) {
      return;
    }
    //////// Enforce switching to flashbots RPC
    setStepActive(RecoveryProcessStatus.CHANGE_RPC);
    const changed = await changeFlashbotNetwork({
      modifyBundleId,
      setRpcParams,
    });
    if (changed) {
      await signTransactionsStep({ currentBundleId, hackedAddress, transactions });
    }
  };

  const signTransactionsStep = async ({
    currentBundleId,
    hackedAddress,
    transactions,
  }: Pick<IStartProcessProps, "currentBundleId" | "hackedAddress" | "transactions">) => {
    // If we're coming from the RPC change step, we should go to gas customization first
    if (stepActive === RecoveryProcessStatus.CHANGE_RPC) {
      setStepActive(RecoveryProcessStatus.CUSTOMIZE_GAS);
      // Calculate initial estimate with default multiplier
      calculateCustomizedGasEstimate(transactions, gasMultiplier);
      return;
    }

    // Otherwise, proceed with the normal flow
    setStepActive(RecoveryProcessStatus.PAY_GAS);
    try {
      await payTheGas(transactions, hackedAddress, gasMultiplier);
      signRecoveryTransactions(hackedAddress, transactions, currentBundleId, true);
      return;
    } catch (e) {
      resetStatus();
      showError(`Error while signing the funding transaction with the safe account. Error: ${e}`);
    }
  };

  const addRelayRPC = async (bundleUuid: string) => {
    let result = null;
    const params = {
      chainId: `0x${targetNetwork.network == "sepolia" ? "aa36a7" : "1"}`,
      chainName: "Hacked Wallet Recovery RPC",
      nativeCurrency: {
        name: "ETH",
        symbol: "ETH",
        decimals: 18,
      },
      rpcUrls: [`${networkConfig.bundleCacheApiUrl}?bundle=${bundleUuid}`],
      blockExplorerUrls: [`${networkConfig.blockExplorerUrl}`],
    };
    if (!window.ethereum || !window.ethereum.request) {
      console.error("MetaMask Ethereum provider is not available");
      return { result, params };
    }

    try {
      result = await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [params, address],
      });
    } catch (error) {
      console.error("Failed to add custom RPC network to wallet automatically, showing rpc details", error);
    }
    return { result, params };
  };

  const showTipsModal = () => {
    setStepActive(RecoveryProcessStatus.DONATE);
  };

  const customizeGasFees = (
    multiplier: number,
    transactions: RecoveryTx[],
    hackedAddress: string,
    currentBundleId: string,
  ) => {
    setGasMultiplier(multiplier);



    // Calculate the new total gas estimate
    calculateCustomizedGasEstimate(transactions, multiplier);

    // Move to the next step
    setStepActive(RecoveryProcessStatus.PAY_GAS);

    // Continue with the process using updated transactions
    return payTheGas(transactions, hackedAddress, gasMultiplier)
      .then(() => {
        console.log("DEBUG: starting signing of recovery transactions after gas customization");
        signRecoveryTransactions(hackedAddress, transactions, currentBundleId, true);
      })
      .catch(e => {
        resetStatus();
        showError(`Error while signing the funding transaction with the safe account. Error: ${e}`);
      });
  };

  const confirmAndSendBundle = async (currentBundleId: string, targetBlock?: number) => {
    setStepActive(RecoveryProcessStatus.SEND_BUNDLE);
    await sendBundle(currentBundleId, targetBlock);
  };

  return {
    data: stepActive,
    sentBlock,
    sentTxHash,
    attemptedBlock,
    gasMultiplier,
    customizedGasEstimate,
    changeFlashbotNetwork,
    startRecoveryProcess,
    signTransactionsStep,
    validateBundleIsReady,
    signRecoveryTransactions,
    generateCorrectTransactions,
    customizeGasFees,
    calculateCustomizedGasEstimate,
    resetStatus,
    showTipsModal,
    unsignedTxs,
    setUnsignedTxs,
    confirmAndSendBundle,
  };
};
