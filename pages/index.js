import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '../config/chains';
import { ChakraProvider, Box, VStack, Heading, Button, Image, Text, HStack, useToast, Table, Thead, Tbody, Tr, Th, Td, extendTheme } from '@chakra-ui/react';
import { EthereumProvider } from '@walletconnect/ethereum-provider';

// Define the dark mode theme
const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

// Utility functions
const sanitizeChainId = (chainId) =>
  typeof chainId === "string" ? parseInt(chainId, 16) : Number(chainId);

const showToast = (toast, title, description, status) => {
  toast({ title, description, status, duration: 2000, isClosable: true });
};

const projectId = 'dbe9fe1215dbe847681ac3dc99af6226'

export default function Home() {
  const [provider, setProvider] = useState(null);
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
  }, [provider]);

  useEffect(() => {
    if (provider) initializeProvider();
  }, [provider, initializeProvider]);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      const wcProvider = await EthereumProvider.init({
        projectId,
        chains: [1, 42161, 137], // mainnet, arbitrum, polygon
        showQrModal: true
      });

      await wcProvider.enable();

      const ethersProvider = new ethers.BrowserProvider(wcProvider);
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();
      const network = await ethersProvider.getNetwork();

      setProvider(ethersProvider);
      setSigner(signer);
      setAddress(address);
      setChainId(sanitizeChainId(network.chainId));
      setSelectedWallet({ name: 'WalletConnect', icon: 'https://image.pngaaa.com/296/6917296-middle.png' });

      showSuccessToast("Wallet Connected", `Connected to account ${address.slice(0, 6)}...${address.slice(-4)}`);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      showErrorToast("Connection Error", "Failed to connect wallet. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      if (provider && provider.disconnect) {
        await provider.disconnect();
      }
      setProvider(null);
      setSigner(null);
      setAddress('');
      setSelectedWallet(null);
      setChainId(null);
      showToast(toast, "Wallet Disconnected", "Your wallet has been disconnected.", "info");
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      showErrorToast("Disconnection Error", "Failed to disconnect wallet. Please try again.");
    }
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

    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId: `0x${targetChainId.toString(16)}` }]);
      const newChainId = await provider.send('eth_chainId', []);
      setChainId(sanitizeChainId(newChainId));
      showSuccessToast("Network Switched", `Switched to ${chainConfig.chainName}`);
    } catch (error) {
      console.error(`Error switching network:`, error);
      showErrorToast("Network Switch Failed", `Failed to switch to ${chainConfig.chainName}: ${error.message}`);
    } finally {
      setIsSwitchingChain(false);
    }
  };

  const sendTransaction = async (chainName) => {
    if (!signer) return;
    setIsSendingTransaction(true);
    try {
      const chainConfig = CHAIN_CONFIG[chainName];
      if (!chainConfig) throw new Error(`Invalid chain name: ${chainName}`);

      const targetChainId = sanitizeChainId(chainConfig.chainId);

      if (chainId !== targetChainId) {
        await switchChain(chainName);
      }

      const address = await signer.getAddress();
      const nonce = await provider.getTransactionCount(address);

      let transaction = {
        to: address,
        value: ethers.utils.parseEther("0"),
        nonce: nonce,
        data: "0x",
        chainId: targetChainId,
      };

      const tx = await signer.sendTransaction(transaction);
      const receipt = await tx.wait();
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
    
    sessionStorage.clear();
    
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    window.indexedDB.databases().then((dbs) => {
      dbs.forEach((db) => {
        window.indexedDB.deleteDatabase(db.name);
      });
    });
    
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
        });
      });
    }
    
    showSuccessToast("Storage Cleared", "All browser storage for this site has been cleared.");
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
                  Connect with WalletConnect
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
