'use client'
import {Card, CardContent, CardHeader} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import * as React from "react";
import {Dispatch, SetStateAction, useContext, useEffect, useState} from "react";
import {cn, getCoinPath, getCoinPathFunc, getFunctionPathFromCoinType, getValueWithDecimals} from "@/lib/utils";
import Image from "next/image";
import {TokenFromRestAPI} from "@/lib/types";
import {
    ConnectButton,
    useCurrentAccount,
    useCurrentWallet,
    useSignAndExecuteTransactionBlock,
    useSuiClient,
    useSuiClientQuery
} from "@mysten/dapp-kit";
import {coinRestApi} from "@/lib/rest";
import {AppConfigContext} from "@/components/Contexts";
import {TransactionBlock,} from "@mysten/sui.js/transactions";
import {bcs} from "@mysten/sui.js/bcs";
import type {CoinStruct, SuiClient} from '@mysten/sui.js/client';
import {useForm} from "react-hook-form";


// Function from: https://www.npmjs.com/package/kriya-dex-sdk?activeTab=code
const getAllUserCoins = async ({
                                   suiClient,
                                   address,
                                   type,
                               }: {
    suiClient: SuiClient;
    type: string;
    address: string;
}): Promise<CoinStruct[]> => {
    let cursor: string | null | undefined = "";

    let coins: CoinStruct[] = [];
    let iter = 0;

    do {
        try {
            const res = await suiClient.getCoins({
                owner: address,
                coinType: type,
                cursor: cursor,
                limit: 50,
            });
            coins = coins.concat(res.data);
            cursor = res.nextCursor;
            if (!res.hasNextPage || iter === 8) {
                cursor = null;
            }
        } catch (error) {
            console.log(error);
            cursor = null;
        }
        iter++;
    } while (cursor !== null);

    return coins;
};


// Function from: https://www.npmjs.com/package/kriya-dex-sdk?activeTab=code
const getCoinsGreaterThanAmount = (
    amount: bigint,
    coins: CoinStruct[]
): string[] => {

    const coinsWithBalance: string[] = [];

    let collectedAmount = BigInt(0);

    for (const coin of coins) {
        const balance = BigInt(coin.balance);
        if (
            collectedAmount < amount &&
            !coinsWithBalance.includes(coin.coinObjectId)
        ) {
            coinsWithBalance.push(coin.coinObjectId);
            collectedAmount = collectedAmount + balance;
        }
        if (
            balance === BigInt(0) &&
            !coinsWithBalance.includes(coin.coinObjectId)
        )
            coinsWithBalance.push(coin.coinObjectId);
    }

    if (collectedAmount >= amount) {
        return coinsWithBalance;
    } else {
        throw new Error("Insufficient balance");
    }

}


// Function from: https://www.npmjs.com/package/kriya-dex-sdk?activeTab=code
const getExactCoinByAmount = (
    coinType: string,
    coins: CoinStruct[],
    amount: bigint,
    txb: TransactionBlock
) => {
    if (coinType === "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI") {
        const [coinA] = txb.splitCoins(txb.gas, [txb.pure(amount)]);
        return coinA;
    } else {
        const coinsX = getCoinsGreaterThanAmount(amount, coins);

        if (coinsX.length > 1) {
            txb.mergeCoins(
                txb.object(coinsX[0]),
                coinsX.slice(1).map((coin) => txb.object(coin))
            );
        }

        const [coinA] = txb.splitCoins(txb.object(coinsX[0]), [
            txb.pure(amount),
        ]);
        return coinA;
    }
};


const CoinSelectDropdown: React.FC<{
    token: TokenFromRestAPI,
    setToken: Dispatch<SetStateAction<TokenFromRestAPI>>
}> = ({token}) => {
    /*TODO below should open coin selection dialog on click*/
    return (<div
        className="rounded-xl min-w-28 dropdown-button bg-gray-800 text-white
                    flex items-center justify-between px-2 py-2
                    cursor-pointer transition duration-150 ease-in-out hover:bg-gray-700">
        <div
            className="max-w-6 max-h-5 flex space-x-0.5 text-md"
        >

            <img
                src={token.iconUrl || "../../public/sui-sea.svg"} //TODO dynamic image from on-chain config
                width={100}
                height={100}
            />
            <span>{token.symbol}</span>
        </div>

        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24"
             stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
    </div>)
}


const generateBuyPtb = (coin: TokenFromRestAPI, userCoins: CoinStruct[], amountToBuy: number): TransactionBlock => {
    console.log("Attempting to buy ", amountToBuy, "of", coin.symbol, "packageId", coin.packageId, "storeId", coin.storeId, "module", coin.module, "decimals", coin.decimals)
    if (amountToBuy <= 0) {
        throw new Error("Attempt to buy 0 or less tokens")
    }


    const txb = new TransactionBlock();
    //Amount here already has multiplication for decimals applied (see TokenAmountInput)
    //txb.gas() for the coin because you purchase the custom coin w/ Sui
    console.log("Splitting coins", txb.gas)
    const splitCoin = txb.moveCall({
        target: getCoinPathFunc(coin, "get_coin_buy_price"),
        arguments: [
            txb.object(coin.storeId),
            txb.pure(amountToBuy),
        ],
    })
    const [payment] = txb.splitCoins(txb.gas, [txb.object(splitCoin)]);

    // txb.transferObjects([payment], "0x7176223a57d720111be2c805139be7192fc5522597e6210ae35d4b2199949501")
    txb.moveCall({
        target: getCoinPathFunc(coin, "buy_coins"),
        arguments: [
            txb.object(coin.storeId),
            txb.object(payment),
            txb.pure(amountToBuy),
        ],
    });
    return txb
}

const generateSellPtb = (coin: TokenFromRestAPI, userCoins: CoinStruct[], amountToSell: number): TransactionBlock => {
    console.log("Attempting to sell ", amountToSell, "of", coin.symbol, "packageId", coin.packageId, "storeId", coin.storeId, "module", coin.module, "decimals", coin.decimals)
    if (amountToSell <= 0) {
        throw new Error("Attempt to buy 0 or less tokens")
    }

    const txb = new TransactionBlock();
    getExactCoinByAmount(getCoinPath(coin), userCoins, BigInt(amountToSell), txb)
    //Amount here already has multiplication for decimals applied (see TokenAmountInput)
    //txb.gas() for the coin because you purchase the custom coin w/ Sui

    console.log("Splitting coins", txb.gas)
    const splitCoin = txb.moveCall({
        target: getCoinPathFunc(coin, "get_coin_sell_price"),
        arguments: [
            txb.object(coin.storeId),
            txb.pure(amountToSell),
        ],
    })
    const [coinToSendToSell] = txb.splitCoins(getCoinPath(coin), [txb.object(splitCoin)]);

    //Amount here already has multiplication for decimals applied (see TokenAmountInput)
    //txb.gas() for the coin because you purchase the custom coin w/ Sui
    const coinPath = getCoinPath(coin)
    console.log("Coin path is", coinPath)
    txb.moveCall({
        target: getCoinPathFunc(coin, "sell_coins"),
        arguments: [
            txb.object(coin.storeId),
            txb.object(coinToSendToSell),
            txb.pure(amountToSell),
        ],
    });
    return txb;
}

export const getBuyCoinPriceTxb = (coinType: string, storeId: string, amount: number): TransactionBlock => {
    const txb = new TransactionBlock()
    txb.moveCall({
        target: getFunctionPathFromCoinType(coinType, "get_coin_buy_price") as `${string}::${string}::${string}`,
        arguments: [
            txb.object(storeId),
            txb.pure(amount),
        ],
    })
    return txb
}
export const getSellCoinPriceTxb = (coinType: string, storeId: string, amount: number): TransactionBlock => {
    const txb = new TransactionBlock()
    txb.moveCall({
        target: getFunctionPathFromCoinType(coinType, "get_coin_sell_price") as `${string}::${string}::${string}`,
        arguments: [
            txb.object(storeId),
            txb.pure(amount),
        ],
    })
    return txb
}

export const getPrice = async (client: SuiClient, sender: string, coinType: string, storeId: string, amount: number, mode: "buy" | "sell"): Promise<number> => {
    console.log(`get coin ${mode} price`, sender)
    const txb = mode === "buy" ? getBuyCoinPriceTxb(coinType, storeId, amount) : getSellCoinPriceTxb(coinType, storeId, amount)


    txb.setSenderIfNotSet(sender)

    const res = await client.devInspectTransactionBlock({
        transactionBlock: txb,
        sender: sender,
    });
    console.log("Inspect result", res)
    const price = res.results?.[0]?.returnValues?.[0][0]
    return bcs.de("u64", new Uint8Array(price || [])) as number
}


export const BuySellDialog: React.FC<{}> = () => {
    const suiClient = useSuiClient()
    const currentAccount = useCurrentAccount()
    const currentWallet = useCurrentWallet()
    const appConfig = useContext(AppConfigContext)
    const {data, refetch, error, isError} = useSuiClientQuery("getObject", {
      id: "coinTesfhjfhf"
    })
    const [token, setToken] = useState<TokenFromRestAPI>()
    useEffect(() => {
        const fetchToken = async () => {
            const t = await coinRestApi.getById(appConfig, "0x443b012ada487098577eb07008fb95caa5eb152e8af4bd85c0cef41ac67bb101")
            console.log("Fetched token", t)
            setToken(t)
        }
        fetchToken()
    }, [])


    const exampleToken = {
        "packageId": "0xa512bbe7d3f75b0b91310057bbbac67aa4f3e1eda49c345fd00c3cfa7fd47c5b",
        "module": "coin_example",
        "storeId": "0x8cb5bc618d9943730a9404ad11143b9588dcd2033033cb6ded0c1bf87c4ceab3",
        "creator": "somecreator",
        "decimals": 3,
        "name": "Test Coin",
        "symbol": "TST",
        "description": "This is a test coin",
        "iconUrl": "https://example.com/icon.png",
        "website": "http://example.com",
        "twitterUrl": "",
        "discordUrl": "",
        "telegramUrl": "",
        "whitepaperUrl": "",
        "coinType": `0xa512bbe7d3f75b0b91310057bbbac67aa4f3e1eda49c345fd00c3cfa7fd47c5b::coin_example::COIN_EXAMPLE`,
        "createdAt": new Date(),
        "updatedAt": new Date(),
    }

    const {mutate: signAndExecuteTransactionBlock} = useSignAndExecuteTransactionBlock();
    const [mode, setMode] = useState<"buy" | "sell">("buy")
    const [baseToken, setBaseToken] = useState<TokenFromRestAPI>(exampleToken)
    const [targetPrice, setTargetPrice] = useState(0)
    const [targetPriceDisplay, setTargetPriceDisplay] = useState("")
    const [userBalance, setUserBalance] = useState(0)
    const [baseTokenCoins, setBaseTokenCoins] = useState<CoinStruct[]>([])
    const {register, handleSubmit, watch, formState: {errors,}} = useForm<{
        amount: number
    }>({
        defaultValues: {
            amount: 0
        }
    });
    const multiplier = baseToken.decimals > 0 ? Math.pow(10, baseToken.decimals) : 1
    const amount = watch("amount") * multiplier

    const {data: storeRaw, refetch: refetchStore} = useSuiClientQuery("getObject", {
        id: baseToken.storeId,
        options: {
            showDisplay: true,
            showContent: true,
        }
    })

    useEffect(() => {
        if (!watch("amount")) return
        const fetchPrice = async () => {
            // await refetchStore()
            console.log("Fetching price for ", mode)
            const price = await getPrice(suiClient, currentAccount?.address || "", baseToken.coinType, baseToken.storeId, amount, mode)
            console.log("Target price is", price)
            setTargetPrice(price)
            // TODO Below works because Sui token is always the target
            setTargetPriceDisplay(getValueWithDecimals(price, 9, 4))
        }
        fetchPrice()
    }, [amount, baseToken, currentAccount?.address, mode, suiClient, watch])

    useEffect(() => {
        const fetchBalance = async () => {
            const balance = await suiClient.getBalance({
                owner: currentAccount?.address || "",
                coinType: getCoinPath(baseToken),
            })
            setUserBalance(parseInt(balance.totalBalance || "0"))

            const coins = await getAllUserCoins({
                suiClient: suiClient,
                type: getCoinPath(baseToken),
                address: currentAccount?.address || "",
            });
            setBaseTokenCoins(coins)
        }
        fetchBalance()
    }, [baseToken, currentAccount?.address, suiClient])

    // const baseTokenControl = <TokenAmountInput variant={"base"} token={baseToken} setToken={setBaseToken}
    //                                            amount={baseAmount} setAmount={setBaseAmount}/>
    // const quoteTokenControl = <TokenAmountInput variant={"quote"} token={quoteToken} setToken={setQuoteToken}
    //                                             amount={quoteAmount} setAmount={setQuoteAmount}/>

    // const controls = controlOrder === "base-quote" ? [baseTokenControl, quoteTokenControl] : [quoteTokenControl, baseTokenControl]
    return (<Card>
            <CardHeader>
                <div className={"flex justify-between min-w-[400px]"}>
                    <Button
                        className={"min-w-36 bg-accent"}
                        variant={mode !== "buy" ? "default" : "secondary"}
                        onClick={() => setMode("buy")}>
                        Buy
                    </Button>
                    <Button
                        className={"min-w-36"}
                        variant={mode === "sell" ? "default" : "outline"}
                        onClick={() => setMode("sell")}>
                        Sell
                    </Button>
                </div>
            </CardHeader>
            <CardContent>

                <div className={"space-y-2 relative"}>
                    <div className={"space-y-4"}>
                        <div className={"rounded-lg p-2"}
                             style={{
                                 backgroundColor: "hsl(210, 88%, 15%)"
                             }}>
                            <p className={"text-xs text-muted-foreground w-full"}>
                                {mode === "buy" ? "You receive" : "You sell"}
                            </p>
                            <div className={"flex pb-2 "}>
                                <input
                                    className={cn(
                                        "flex h-10" +
                                        " focus:outline-none" +
                                        " disabled:cursor-not-allowed disabled:opacity-50 text-2xl",
                                    )}
                                    style={{
                                        backgroundColor: "hsl(210, 88%, 15%)",
                                    }}
                                    {...register("amount")}
                                    // onChange={(e) => {
                                    //     let targetValue = parseInt(e.target.value)
                                    //     if (targetValue > userBalance) {
                                    //         targetValue = userBalance
                                    //     }
                                    //     setAmount(targetValue)
                                    // }}
                                />
                                {/*<CoinSelectDropdown token={token} setToken={setToken}/>*/}
                            </div>
                            {/*Render form errors*/}
                            {errors.amount && <div className={"text-xs text-red-500"}>{errors.amount.message}</div>}
                            <div className={"text-xs text-muted-foreground"}>
                                Max: {userBalance}
                                {
                                    process.env.NODE_ENV === "development" && <>
                                        {/*<div className={"overflow-ellipsis"}>*/}
                                        {/*    coinPath: {`${getCoinPath(token)}`}*/}
                                        {/*</div>*/}
                                        <div>
                                            actualAmount: {amount}
                                        </div>
                                        {/*<div>*/}
                                        {/*    coinObjectCount: {`${balance.data?.coinObjectCount}`}*/}
                                        {/*</div>*/}
                                        {/*<div>*/}
                                        {/*    lockedBalance: {`${JSON.stringify(balance.data?.lockedBalance)}`}*/}
                                        {/*</div>*/}
                                        {/*<div>*/}
                                        {/*    totalBalance: {`${balance.data?.totalBalance}`}*/}
                                        {/*</div>*/}
                                    </>
                                }
                            </div>
                        </div>
                    </div>
                    {/*{baseTokenControl}*/}
                    {/*Button below is the swap button, TODO using the wrong colors*/}

                    {/*<button*/}
                    {/*    className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 top-1/2 z-10 p-2 rounded-full bg-blue-500 hover:bg-blue-700 text-white"*/}
                    {/*    style={{marginTop: '-0.5rem'}}  // Adjust this value to position the button correctly*/}
                    {/*    onClick={() => setControlOrder(controlOrder === "base-quote" ? "quote-base" : "base-quote")}*/}
                    {/*>*/}
                    {/*    <div>*/}
                    {/*        <Image*/}
                    {/*            src={"./material-swap.svg"}*/}
                    {/*            alt={"swap"}*/}
                    {/*            width={20}*/}
                    {/*            height={20}*/}
                    {/*        />*/}
                    {/*    </div>*/}
                    {/*</button>*/}
                    <div className={"text-center"}>
                        {targetPrice > 0 && <div>
                            <div>You&apos;ll {mode === "buy" ? "pay" : "receive"}</div>
                            <div className={"flex space-x-2 justify-center"}>
                                <Image src={"./sui-sea.svg"} alt={"Sui Logo"} width={20} height={20}/>
                                <div className={"text-xl"}>~{targetPriceDisplay} SUI</div>
                            </div>
                        </div>}
                        {process.env.NODE_ENV === "development" && <div className={"text-muted-foreground text-xs"}>
                            Current supply: {storeRaw?.data?.content?.fields.treasury.fields.total_supply.fields.value}
                        </div>}
                    </div>
                    {/*{controls[1]}*/}
                    {currentAccount ?
                        <Button className={"min-w-72"} onClick={() => signAndExecuteTransactionBlock({
                            transactionBlock: mode === "buy"
                                ? generateBuyPtb(exampleToken, [], amount)
                                : generateSellPtb(exampleToken, baseTokenCoins, amount),
                            chain: 'sui:devnet',
                        })}>
                            {mode === "buy" ? "Buy" : "Sell"}
                        </Button> : <ConnectButton/>
                    }
                </div>
            </CardContent>
        </Card>

    )
}