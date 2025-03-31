import { useRef, useState } from "react";
import styles from "../manualAssetSelection.module.css";
import { CustomButton } from "~~/components/CustomButton/CustomButton";
import { IWrappedRecoveryTx } from "~~/hooks/flashbotRecoveryBundle/useAutodetectAssets";
import { RecoveryTx } from "~~/types/business";
import { notification } from "~~/utils/scaffold-eth";

interface IUploadFlowProps {
  hackedAddress: string;
  addAsset: (asset: IWrappedRecoveryTx) => void;
  addMultipleAssets?: (assets: IWrappedRecoveryTx[]) => void;
}

export const UploadFlow = ({ hackedAddress, addAsset, addMultipleAssets }: IUploadFlowProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<RecoveryTx[]>([]);
  
  // Trigger file input click
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as RecoveryTx[];
        
        // Validate the uploaded data structure
        if (Array.isArray(parsed) && parsed.length > 0) {
          setParsedTransactions(parsed);
        } else {
          notification.error("Invalid transaction file format");
          setSelectedFile(null);
        }
      } catch (error) {
        console.error("Error parsing transaction file:", error);
        notification.error("Error parsing transaction file. Please ensure it's a valid JSON file.");
        setSelectedFile(null);
      }
    };
    reader.readAsText(file);
    
    // Reset the file input
    if (event.target) {
      event.target.value = '';
    }
  };

  // Add all transactions to the basket
  const addAllTransactions = () => {
    if (parsedTransactions.length === 0) return;
    
    // Create wrapped transactions with the current hacked address
    const wrappedTransactions: IWrappedRecoveryTx[] = parsedTransactions.map(tx => {
      // Ensure the from address is set to the current hacked address
      const modifiedTx = {
        ...tx,
        toEstimate: {
          ...tx.toEstimate,
          from: hackedAddress as `0x${string}`
        }
      };
      
      return { tx: modifiedTx };
    });
    
    // Use addMultipleAssets if available, otherwise add one by one
    if (addMultipleAssets) {
      addMultipleAssets(wrappedTransactions);
      notification.success(`Added ${wrappedTransactions.length} transactions to the basket`);
    } else {
      wrappedTransactions.forEach(tx => {
        addAsset(tx);
      });
      notification.success(`Added ${wrappedTransactions.length} transactions to the basket`);
    }
    
    // Reset state
    setSelectedFile(null);
    setParsedTransactions([]);
  };

  return (
    <div className={styles.containerCustom}>
      <div className="mt-10" />
      <h4 className="text-lg font-medium mb-4">Upload Transaction Bundle</h4>
      <p className="mb-6 text-sm">
        Upload a previously saved transaction bundle JSON file to restore your transactions.
      </p>
      
      <div className="flex flex-col items-center gap-4 mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        
        <button 
          className="btn btn-outline w-full"
          onClick={triggerFileUpload}
        >
          {selectedFile ? selectedFile.name : "Select Transaction File"}
        </button>
        
        {selectedFile && (
          <div className="text-sm">
            <p>Found {parsedTransactions.length} transactions in file</p>
          </div>
        )}
      </div>
      
      <CustomButton 
        type="btn-primary" 
        text={"Add All Transactions"} 
        disabled={parsedTransactions.length === 0}
        onClick={addAllTransactions} 
      />
    </div>
  );
}; 