import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import GasSvg from "../../../../../public/assets/flashbotRecovery/gas.svg";
import styles from "./transactionBundleStep.module.css";
import { BigNumber, ethers } from "ethers";
import { motion } from "framer-motion";
import { useInterval } from "usehooks-ts";
import { CustomButton } from "~~/components/CustomButton/CustomButton";
import { TransactionItem } from "~~/components/Processes/BundlingProcess/Steps/TransactionBundleStep/TransactionItem";
import { useGasEstimation } from "~~/hooks/flashbotRecoveryBundle/useGasEstimation";
import BackSvg from "~~/public/assets/flashbotRecovery/back.svg";
import { RecoveryTx } from "~~/types/business";

interface IProps {
  isVisible: boolean;
  clear: () => void;
  transactions: RecoveryTx[];
  onBack: () => void;
  modifyTransactions: Dispatch<SetStateAction<RecoveryTx[]>>;
  onSubmit: () => void;
  totalGasEstimate: BigNumber;
  setTotalGasEstimate: Dispatch<SetStateAction<BigNumber>>;
}

export const TransactionBundleStep = ({
  clear,
  onBack,
  isVisible,
  onSubmit,
  transactions,
  modifyTransactions,
  totalGasEstimate,
  setTotalGasEstimate,
}: IProps) => {
  const { estimateTotalGasPrice } = useGasEstimation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateGasEstimate = useCallback(async () => {
    if (transactions.length === 0) return;
    const estimate = await estimateTotalGasPrice(transactions, removeUnsignedTx, modifyTransactions);
    setTotalGasEstimate(estimate);
  }, [transactions, estimateTotalGasPrice, setTotalGasEstimate]);

  useEffect(() => {
    updateGasEstimate();
  }, [updateGasEstimate]);

  useInterval(updateGasEstimate, transactions.length > 0 ? 10000 : null);

  const removeUnsignedTx = (txId: number) => {
    modifyTransactions((prev: RecoveryTx[]) => {
      if (txId < 0 || txId > prev.length) {
        return prev.filter(a => a);
      }
      delete prev[txId];

      // When user removes the last item
      if (prev.length == 1 && txId == 0) {
        clear();
      }

      return prev.filter(a => a);
    });
  };

  // Download transactions as JSON file
  const downloadTransactions = () => {
    if (transactions.length === 0) return;
    
    const dataStr = JSON.stringify(transactions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `recovery-transactions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Trigger file input click
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedTransactions = JSON.parse(content) as RecoveryTx[];
        
        // Validate the uploaded data structure
        if (Array.isArray(parsedTransactions) && parsedTransactions.length > 0) {
          modifyTransactions(parsedTransactions);
        } else {
          alert("Invalid transaction file format");
        }
      } catch (error) {
        console.error("Error parsing transaction file:", error);
        alert("Error parsing transaction file. Please ensure it's a valid JSON file.");
      }
    };
    reader.readAsText(file);
    
    // Reset the file input
    if (event.target) {
      event.target.value = '';
    }
  };

  if (!isVisible) {
    return <></>;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.container}>
      <div className={styles.mainContent}>
        <div className={styles.gasContainer}>
          <span className={styles.gasValue}>{ethers.utils.formatEther(totalGasEstimate.toString())}</span>
          <div className="ml-2"></div>
          <Image height={20} width={20} src={GasSvg} alt="" />
        </div>
        <div className="m-4" />
        <div className={`flex items-center justify-center ${styles.titleContainer}`}>
          <Image src={BackSvg} alt={""} className="h-5 w-5 absolute" style={{ left: 30 }} onClick={onBack} />
          <h2 className={styles.title}>Your transactions</h2>
        </div>
        <div className={styles.assetList}>
          {transactions.map((item, i) => (
            <TransactionItem key={i} onDelete={() => removeUnsignedTx(i)} tx={item} />
          ))}
        </div>
        
        {/* File actions container */}
        <div className={styles.fileActionsContainer}>
          <button 
            className={styles.fileActionButton} 
            onClick={downloadTransactions}
            disabled={transactions.length === 0}
          >
            Download Transactions
          </button>
          <button 
            className={styles.fileActionButton} 
            onClick={triggerFileUpload}
          >
            Upload Transactions
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
        </div>
        
        <span className={styles.clear} onClick={clear}>
          Clear all
        </span>
        <CustomButton type="btn-primary" text={"Start Signing"} onClick={() => onSubmit()} />
      </div>
    </motion.div>
  );
};
