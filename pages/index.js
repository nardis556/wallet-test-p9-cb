import { useState, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider } from 'ethers';
import { CHAIN_CONFIG } from '../config/chains';
import { ChakraProvider, Box, VStack, Heading, Button, Image, Text, HStack, useToast, Table, Thead, Tbody, Tr, Th, Td, extendTheme } from '@chakra-ui/react';
import CoinbaseWalletSDK from '@coinbase/wallet-sdk';

// Define the dark mode theme
const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

// redep

// Utility functions
const sanitizeChainId = (chainId) =>
  typeof chainId === "string" ? parseInt(chainId, 16) : Number(chainId);

const showToast = (toast, title, description, status) => {
  toast({ title, description, status, duration: 2000, isClosable: true });
};

let ethereum;
let provider;

const performUnlockCoinbaseWallet = async () => {
  console.log('[coinbaseWallet] Initialize WalletSDK');
  const CoinbaseWalletSDK = (await import('@coinbase/wallet-sdk')).default;

  // Initialize Coinbase Wallet SDK
  const coinbaseWallet = new CoinbaseWalletSDK({
    appName: 'IDEX',
    appLogoUrl: 'https://exchange.idex.io/static/images/idex-logo-white.svg',
  });

  ethereum = coinbaseWallet.makeWeb3Provider();

  console.log('[coinbaseWallet] Initialize', { ethereum });
  provider = new ethers.BrowserProvider(ethereum);

  const walletAddress = await ethereum
    .request({ method: 'eth_requestAccounts' })
    .then(accounts => {
      const firstWallet = accounts[0];
      console.log(`[coinbaseWallet] Found wallet ${firstWallet}`);
      return firstWallet;
    });

  return walletAddress
    ? {
        publicKey: walletAddress,
        ethereum,
        provider,
      }
    : undefined;
};

let unlockingPromise;

const unlockCoinbaseWallet = async () => {
  unlockingPromise = unlockingPromise
    ? unlockingPromise
    : performUnlockCoinbaseWallet();
  const unlockedWallet = await unlockingPromise;
  unlockingPromise = undefined;
  return unlockedWallet;
};

const removeCoinbaseWalletFromLocalStorage = () => {
  if (ethereum?.disconnect) {
    ethereum?.disconnect();
  }
  Object.keys(window.localStorage)
    .filter(
      key =>
        key.includes('__WalletLink__') ||
        key.includes('-coinbaseWallet:') ||
        key.includes('-walletlink:')
    )
    .forEach(keyToRemove => localStorage.removeItem(keyToRemove));
};

const disconnectCoinbaseWallet = () => {
  setTimeout(() => {
    ethereum?.disconnect();
    removeCoinbaseWalletFromLocalStorage();
  }, 2000);
};

export default function Home() {
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const [isSendingTransaction, setIsSendingTransaction] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const toast = useToast();

  const showSuccessToast = (title, description) => showToast(toast, title, description, "success");
  const showErrorToast = (title, description) => showToast(toast, title, description, "error");
  const showWarningToast = (title, description) => showToast(toast, title, description, "warning");

  const initializeProvider = useCallback(async () => {
    if (!provider) return null;
    const network = await provider.getNetwork();
    console.log("Initialize provider network:", network);
    setChainId(sanitizeChainId(network.chainId));
    return provider;
  }, []);

  useEffect(() => {
    if (provider) initializeProvider();
  }, [provider, initializeProvider]);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      const unlockedWallet = await unlockCoinbaseWallet();
      if (!unlockedWallet) {
        throw new Error("Failed to unlock Coinbase Wallet");
      }

      const { publicKey, ethereum: eth, provider: prov } = unlockedWallet;
      ethereum = eth;
      provider = prov;

      ethereum.on("accountsChanged", (accounts) => {
        console.log('[coinbaseWallet] Account change detected', accounts);
        const firstWallet = accounts[0];
        if (firstWallet) {
          setAddress(firstWallet);
        }
      });

      ethereum.on("chainChanged", (chainIdHex) => {
        const newChainId = sanitizeChainId(chainIdHex);
        console.log('[coinbaseWallet] Chain change - rebuilding for', newChainId);
        setChainId(newChainId);
        if (ethereum) {
          // no "any" fallback returns: Error: network changed: 42161 => 10  (event="changed", code=NETWORK_ERROR, version=6.9.0)
          // provider = new ethers.BrowserProvider(ethereum);
          provider = new ethers.BrowserProvider(ethereum, "any");
        } else {
          console.error('[coinbaseWallet] Eth instance not available');
        }
      });

      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      const network = await provider.getNetwork();

      setSigner(signer);
      setAddress(account);
      setChainId(sanitizeChainId(network.chainId));
      setSelectedWallet({ name: 'Coinbase Wallet', icon: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Felis_silvestris_silvestris_small_gradual_decrease_of_quality.png' });

      showSuccessToast("Wallet Connected", `Connected to account ${account.slice(0, 6)}...${account.slice(-4)}`);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      showErrorToast("Connection Error", "Failed to connect wallet. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    disconnectCoinbaseWallet();
    provider = null;
    setSigner(null);
    setAddress('');
    setSelectedWallet(null);
    setChainId(null);
    showToast(toast, "Wallet Disconnected", "Your wallet has been disconnected.", "info");
  };

  const switchChain = async (chainName) => {
    setIsSwitchingChain(true);
    const chainConfig = CHAIN_CONFIG[chainName];
    if (!chainConfig) {
      setIsSwitchingChain(false);
      showErrorToast("Invalid Chain", `Chain ${chainName} is not configured.`);
      return;
    }

    const targetChainId = sanitizeChainId(chainConfig.chainId);
    const formattedChainId = `0x${targetChainId.toString(16)}`;

    console.log(`Attempting to switch to network: ${chainName} (${formattedChainId})`);

    try {
      if (chainId === targetChainId) {
        console.log(`Already on the correct chain: ${chainConfig.chainName}`);
        setIsSwitchingChain(false);
        return;
      }

      if (!ethereum) {
        throw new Error("No provider available. Please connect a wallet first.");
      }

      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: formattedChainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          try {
            await addNetwork(chainConfig, formattedChainId);
          } catch (addError) {
            throw addError;
          }
        } else {
          throw switchError;
        }
      }

      console.log(`Switched to chain: ${formattedChainId}`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const newProvider = await initializeProvider();
      const newSigner = await newProvider.getSigner();
      setSigner(newSigner);
      const newChainId = await newProvider.getNetwork().then(network => sanitizeChainId(network.chainId));
      setChainId(newChainId);

      console.log(`Provider re-initialized after chain switch. New chain ID: ${newChainId}`);

      showSuccessToast("Network Switched", `Switched to ${chainConfig.chainName}`);
    } catch (error) {
      console.error(`Error switching network:`, error);
      showErrorToast("Network Switch Failed", `Failed to switch to ${chainConfig.chainName}: ${error.message}`);
    } finally {
      setIsSwitchingChain(false);
    }
  };

  const addNetwork = async (chainConfig, formattedChainId) => {
    const params = [{
      chainId: formattedChainId,
      chainName: chainConfig.chainName,
      nativeCurrency: chainConfig.nativeCurrency,
      rpcUrls: chainConfig.rpcUrls,
      blockExplorerUrls: chainConfig.blockExplorerUrls
    }];

    if (ethereum) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: params
      });
    } else {
      throw new Error("No provider available");
    }
    console.log(`Added network: ${chainConfig.chainName}`);
  };

  const sendTransaction = async (chainName) => {
    if (!signer) return;
    setIsSendingTransaction(true);
    try {
      const chainConfig = CHAIN_CONFIG[chainName];
      if (!chainConfig) throw new Error(`Invalid chain name: ${chainName}`);

      const targetChainId = sanitizeChainId(chainConfig.chainId);

      console.log(`Preparing to send transaction on ${chainName} (Chain ID: ${targetChainId})`);
      console.log(`Current chain ID: ${chainId}`);

      if (chainId !== targetChainId) {
        console.log(`Chain mismatch. Switching to ${chainName}...`);
        await switchChain(chainName);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const newProvider = await initializeProvider();
        const newSigner = await newProvider.getSigner();
        setSigner(newSigner);

        const currentChainId = await newProvider.getNetwork().then(network => sanitizeChainId(network.chainId));
        console.log(`After switch: Current chain ID: ${currentChainId}, Target chain ID: ${targetChainId}`);
        if (currentChainId !== targetChainId) {
          throw new Error(`Failed to switch to the correct chain. Expected ${targetChainId}, got ${currentChainId}`);
        }
      }

      const address = await signer.getAddress();
      const nonce = await provider.getTransactionCount(address);

      let transaction = {
        to: address,
        value: ethers.parseEther("0"),
        nonce: nonce,
        data: "0x",
        chainId: targetChainId,
      };

      console.log(`Sending transaction:`, transaction);

      const tx = await signer.sendTransaction(transaction);
      console.log(`Transaction sent:`, tx.hash);
      const receipt = await tx.wait();
      console.log(`Transaction confirmed on ${chainName}:`, receipt.hash);
      showSuccessToast("Transaction Sent", `Transaction successfully sent on ${chainName}`);
    } catch (error) {
      console.error('Error sending transaction:', error);
      showErrorToast("Transaction Error", `Failed to send transaction on ${chainName}: ${error.message}`);
    } finally {
      setIsSendingTransaction(false);
    }
  };

  const clearLocalStorageAndRefresh = () => {
    setIsClearing(true);
    localStorage.clear();
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
        });
      });
    }
    showSuccessToast("Storage Cleared", "Local storage and cache have been cleared.");
    setTimeout(() => {
      window.location.reload(true);
    }, 1000);
  };

  return (
    <ChakraProvider theme={theme}>
      <Box maxWidth="800px" margin="auto" padding={8}>
        <VStack spacing={8} align="stretch">
          <Heading as="h1" size="xl" textAlign="center">wallet-test-app</Heading>

          {!selectedWallet ? (
            <Box>
              <Heading as="h2" size="lg" mb={4}>Connect Wallet</Heading>
              <VStack spacing={4}>
                <Button
                  onClick={connectWallet}
                  colorScheme="blue"
                  width="100%"
                  isLoading={isConnecting}
                  loadingText="Connecting"
                >
                  Connect with Coinbase Wallet
                </Button>
              </VStack>
            </Box>
          ) : (
            <Box>
              <Heading as="h2" size="lg" mb={4}>Connected Wallet</Heading>
              <HStack justifyContent="space-between">
                <HStack>
                  <Image src={selectedWallet.icon} alt={selectedWallet.name} boxSize="24px" />
                  <Text>{selectedWallet.name}: {address.slice(0, 4)}...{address.slice(-2)}</Text>
                </HStack>
                <Button onClick={disconnectWallet} colorScheme="red">
                  Disconnect
                </Button>
              </HStack>
            </Box>
          )}

          <Box>
            <Heading as="h2" size="lg" mb={4}>Chain Information</Heading>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Chain</Th>
                  <Th>Chain ID</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {Object.entries(CHAIN_CONFIG).map(([chainName, config]) => (
                  <Tr key={chainName}>
                    <Td>{config.chainName}</Td>
                    <Td>{config.chainId}</Td>
                    <Td>
                      <Button onClick={() => switchChain(chainName)} colorScheme="blue" mr={2} isLoading={isSwitchingChain} loadingText="Switching">
                        Switch
                      </Button>
                      <Button onClick={() => sendTransaction(chainName)} colorScheme="green" isLoading={isSendingTransaction} loadingText="Sending">
                        Send 0 ETH
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>

          <Box>
            <Button onClick={clearLocalStorageAndRefresh} colorScheme="red" isLoading={isClearing} loadingText="Clearing">
              Clear Local Storage and Refresh
            </Button>
          </Box>
        </VStack>
      </Box>
    </ChakraProvider>
  );
}
