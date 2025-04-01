import React, { useState, useEffect } from "react";
import styles from "./recoveryProcess.module.css";
import { BigNumber, ethers } from "ethers";
import { CustomButton } from "~~/components/CustomButton/CustomButton";
import { InputBase } from "~~/components/scaffold-eth";

interface IGasCustomizationStepProps {
  initialMultiplier: number;
  transactions: any[];
  hackedAddress: string;
  currentBundleId: string;
  onCustomizeGas: (multiplier: number, transactions: any[], hackedAddress: string, currentBundleId: string) => void;
  calculateEstimate: (transactions: any[], multiplier: number) => BigInt;
}

export const GasCustomizationStep = ({
  initialMultiplier,
  transactions,
  hackedAddress,
  currentBundleId,
  onCustomizeGas,
  calculateEstimate,
}: IGasCustomizationStepProps) => {
  const [multiplier, setMultiplier] = useState<number>(initialMultiplier);
  const [multiplierInput, setMultiplierInput] = useState<string>(initialMultiplier.toString());
  const [estimatedCost, setEstimatedCost] = useState<string>("0");
  const MAX_MULTIPLIER = 1000;

  useEffect(() => {
    // Calculate the estimated cost whenever the multiplier changes
    const totalFee = calculateEstimate(transactions, multiplier);
    setEstimatedCost(ethers.utils.formatEther(totalFee.toString()));
  }, [multiplier, transactions, calculateEstimate]);

  const handleMultiplierChange = (value: string) => {
    // Store the raw input value
    setMultiplierInput(value);
    
    // Convert to number for validation and calculations
    const numValue = parseFloat(value.replace(",", "."));
    if (!isNaN(numValue)) {
      // Ensure it's at least 1 and at most MAX_MULTIPLIER
      const clampedValue = Math.max(1, Math.min(MAX_MULTIPLIER, numValue));
      setMultiplier(clampedValue);
    }
  };

  return (
    <div className={styles.gasCustomizationContainer}>
      <div className={styles.inputContainer}>
        <label className={styles.label} htmlFor="gasMultiplier">
          Gas Fee Multiplier (1-{MAX_MULTIPLIER}x)
        </label>
        <div className="mt-2" />
        <InputBase
          name="gasMultiplier"
          placeholder="1.0"
          value={multiplierInput}
          onChange={handleMultiplierChange}
        />
        <span className={`${styles.multiplier} text-base-100`}>x</span>
      </div>
      
      <div className={styles.estimateContainer}>
        <p className={styles.estimateLabel}>Estimated Total Gas Cost:</p>
        <p className={styles.estimateValue}>{estimatedCost} ETH</p>
        <p className={styles.estimateNote}>
          Higher multipliers increase the chance of your transactions being included quickly.
          {multiplier > 100 && (
            <span className={styles.warningText}>
              {" "}Warning: Very high multipliers may result in excessive gas costs.
            </span>
          )}
        </p>
      </div>
      
      <div className={styles.buttonContainer}>
        <CustomButton
          type="btn-primary"
          text="Continue with Custom Gas"
          onClick={() => onCustomizeGas(multiplier, transactions, hackedAddress, currentBundleId)}
        />
      </div>
    </div>
  );
}; 