'use client';
import {Inter} from "next/font/google";
import '@mysten/dapp-kit/dist/index.css';
import "./globals.css";
import Navbar from "@/components/Navbar";
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {StrictMode, useEffect, useState} from "react";
import {SuiClientProvider, WalletProvider} from '@mysten/dapp-kit';
import {getFullnodeUrl} from '@mysten/sui.js/client';

const inter = Inter({subsets: ["latin"]});

// export const metadata: Metadata = {
//     title: "Create Next App",
//     description: "Generated by create next app",
// };

const queryClient = new QueryClient();
const networks = {
    localnet: {url: getFullnodeUrl('localnet')},
    devnet: {url: getFullnodeUrl('devnet')},
    testnet: {url: getFullnodeUrl('testnet')},
    mainnet: {url: getFullnodeUrl('mainnet')},
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])
    return (
        <html lang="en">
        <body className={inter.className}>
        <StrictMode>
            {isClient ?
            <QueryClientProvider client={queryClient}>
                <SuiClientProvider networks={networks} defaultNetwork="devnet">
                    <WalletProvider>
                        <Navbar/>
                        {children}
                    </WalletProvider>
                </SuiClientProvider>
            </QueryClientProvider> : "How dis happen?"}
        </StrictMode>
        </body>
        </html>
    );
}
