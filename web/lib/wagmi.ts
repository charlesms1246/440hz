import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G-Galileo-Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  chains: [zeroGGalileo],
  connectors: [injected()],
  transports: {
    [zeroGGalileo.id]: http('https://evmrpc-testnet.0g.ai'),
  },
  ssr: true,
})
