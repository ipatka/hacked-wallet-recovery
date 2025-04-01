import React, { useState, useEffect } from "react";
import styles from "./recoveryProcess.module.css";
import { ethers } from "ethers";
import { CustomButton } from "~~/components/CustomButton/CustomButton";
import { InputBase } from "~~/components/scaffold-eth";
import { RecoveryTx } from "~~/types/business";
import { usePublicClient } from "wagmi";
import { getTargetNetwork } from "~~/utils/scaffold-eth";

interface IConfirmBundleStepProps {
  transactions: RecoveryTx[];
  currentBundleId: string;
  onConfirmBundle: (currentBundleId: string, targetBlock?: number) => void;
}

export const ConfirmBundleStep = ({
  transactions,
  currentBundleId,
  onConfirmBundle,
}: IConfirmBundleStepProps) => {
  const targetNetwork = getTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const [currentBlockNumber, setCurrentBlockNumber] = useState<number>(0);
  const [targetBlockNumber, setTargetBlockNumber] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch current block number on component mount
  useEffect(() => {
    const fetchBlockNumber = async () => {
      try {
        const blockNumber = await publicClient.getBlockNumber();
        const currentBlock = parseInt(blockNumber.toString());
        setCurrentBlockNumber(currentBlock);
        // Default to current block + 2 as recommended starting point
        setTargetBlockNumber((currentBlock + 2).toString());
      } catch (error) {
        console.error("Failed to fetch current block number:", error);
      }
    };

    fetchBlockNumber();
    
    // Set up polling to keep block number updated
    const intervalId = setInterval(fetchBlockNumber, 12000); // ~12 seconds per block
    
    return () => clearInterval(intervalId);
  }, [publicClient]);

  const handleSubmit = () => {
    setIsLoading(true);
    const targetBlock = targetBlockNumber ? parseInt(targetBlockNumber) : undefined;
    onConfirmBundle(currentBundleId, targetBlock);
  };

  return (
    <div className={styles.confirmBundleContainer}>
      <h3 className={styles.confirmTitle}>Review Your Transactions</h3>
      <p className={styles.confirmDescription}>
        Please review the following transactions before sending the bundle.
      </p>
      
      <div className={styles.transactionsList}>
        {transactions.map((tx, index) => (
          <div key={index} className={styles.transactionCard}>
            <h4>Transaction {index + 1}</h4>
            {tx.toSign && (
              <div className={styles.transactionDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>From:</span>
                  <span className={styles.detailValue}>{tx.toSign.from}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>To:</span>
                  <span className={styles.detailValue}>{tx.toSign.to}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Data:</span>
                  <span className={styles.detailValue}>
                    {tx.toSign.data.length > 50 
                      ? `${tx.toSign.data.substring(0, 25)}...${tx.toSign.data.substring(tx.toSign.data.length - 25)}`
                      : tx.toSign.data}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className={styles.blockNumberContainer}>
        <h4 className={styles.blockNumberTitle}>Target Block Number</h4>
        <p className={styles.blockNumberDescription}>
          Current block: <strong>{currentBlockNumber}</strong>. Recommended starting point: <strong>{currentBlockNumber + 2}</strong>
        </p>
        <div className={styles.blockNumberInputContainer}>
          <InputBase
            name="targetBlockNumber"
            placeholder="Enter target block number"
            value={targetBlockNumber}
            onChange={value => setTargetBlockNumber(value.replace(/[^0-9]/g, ''))}
          />
        </div>
        <p className={styles.blockNumberHint}>
          The bundle will first attempt inclusion at this block number. If not included, it will try subsequent blocks.
        </p>
      </div>
      
      <div className={styles.buttonContainer}>
        <CustomButton
          type="btn-primary"
          text={isLoading ? "Sending..." : "Confirm and Send Bundle"}
          onClick={handleSubmit}
          disabled={isLoading || !targetBlockNumber}
        />
      </div>
    </div>
  );
};
