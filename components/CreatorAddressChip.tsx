import React, {FC, memo} from "react";
import Link from "next/link";
import Jazzicon, {jsNumberForAddress} from "react-jazzicon";
import {addressToBackgroundColor} from "@/lib/utils";
import Image from "next/image";


type CreatorAddressChipProps = {
    address: string;
    showAvatar?: boolean;
    avatarImageUrl?: string;
    variant?: "small" | "default" | "large";
    isCreator?: boolean;
    isBondingCurve?: boolean;
}

const avatarVariants = {
    small: {
        jazziconDiam: 16,
        imgSize: 4,
        avatarClass: "w-4 h-4 rounded-full",
        linkClass: "flex items-center space-x-1 text-xs",
        textClass: "font-mono px-1 py-0.5 rounded hover:underline",
        text: (address: string) => address.slice(2, 8)
    },
    default: {
        jazziconDiam: 24,
        imgSize: 6,
        avatarClass: "w-6 h-6 rounded-full",
        linkClass: "flex items-center space-x-1",
        textClass: "font-mono px-2 py-1 rounded hover:underline",
        text: (address: string) => address.slice(2, 8)
    },
    large: {
        jazziconDiam: 32,
        imgSize: 8,
        avatarClass: "w-8 h-8 rounded-full",
        linkClass: "flex items-center space-x-1",
        textClass: "font-mono px-2 py-1 rounded text-md hover:underline",
        text: (address: string) => address.slice(0, 6) + "..." + address.slice(-4)
    }
}

const CreatorAddressChipComponent: FC<CreatorAddressChipProps> = ({
                                                                      address,
                                                                      showAvatar,
                                                                      avatarImageUrl,
                                                                      variant = "default",
                                                                      isCreator = false,
                                                                      isBondingCurve = false
                                                                  }) => {
    const config = avatarVariants[variant]
    //TODO Support user avatars
    let avatar = <Jazzicon diameter={config.jazziconDiam} seed={jsNumberForAddress(address)}/>

    if (avatarImageUrl) {
        avatar = <Image src={avatarImageUrl} alt={"avatar"} className={config.avatarClass}/>

    }
    let suffix = ""
    if (isCreator) suffix = "(dev)"
    if (isBondingCurve) suffix = "(bonding curve)"

    return <Link href={`/profile/${address}`} className={config.linkClass}>
        {showAvatar && avatar}
        <span className={config.textClass}
              style={{backgroundColor: addressToBackgroundColor(address)}}>
                {config.text(address)} {suffix}
            </span>
    </Link>
}
export const CreatorAddressChip = memo(CreatorAddressChipComponent)