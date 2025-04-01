import React from "react";
import styles from "./recoveryProcess.module.css";
import { ethers } from "ethers";
import { CustomButton } from "~~/components/CustomButton/CustomButton";
import { RecoveryTx } from "~~/types/business";

interface IConfirmBundleStepProps {
  transactions: RecoveryTx[];
  currentBundleId: string;
  onConfirmBundle: (currentBundleId: string) => void;
}

export const ConfirmBundleStep = ({
  transactions,
  currentBundleId,
  onConfirmBundle,
}: IConfirmBundleStepProps) => {
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
      
      <div className={styles.buttonContainer}>
        <CustomButton
          type="btn-primary"
          text="Confirm and Send Bundle"
          onClick={() => onConfirmBundle(currentBundleId)}
        />
      </div>
    </div>
  );
};
