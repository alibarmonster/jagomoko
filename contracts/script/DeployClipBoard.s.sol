// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {DeploymentFile} from "./DeploymentFile.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {Character} from "../src/Character.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {CommunityTreasury} from "../src/CommunityTreasury.sol";
import {ClipBoard} from "../src/ClipBoard.sol";

/// @notice Adds ClipBoard to a deployment that is already live, leaving the other contracts as they
///         are. Run it with the key that deployed them (that key is the Character admin):
///
///           forge script script/DeployClipBoard.s.sol --rpc-url monad_testnet              (dry run)
///           forge script script/DeployClipBoard.s.sol --rpc-url monad_testnet --broadcast
///
///         Env: PRIVATE_KEY. On a broadcast it adds "ClipBoard" to deployments/<chainId>.json and
///         keeps every other value; a dry run leaves the file alone.
contract DeployClipBoard is DeploymentFile {
    function run() external returns (ClipBoard clips) {
        string memory path = _deploymentPath();
        string memory json = vm.readFile(path);
        require(!vm.keyExistsJson(json, ".ClipBoard"), "ClipBoard is already in the deployment file");

        clips = _deploy(vm.envUint("PRIVATE_KEY"), json);
        console2.log("ClipBoard", address(clips));

        if (!_broadcasting()) {
            console2.log("Dry run: nothing was sent and", path, "was not changed");
            return clips;
        }
        string[] memory keys = new string[](1);
        address[] memory values = new address[](1);
        (keys[0], values[0]) = ("ClipBoard", address(clips));
        _record(json, path, keys, values);
        console2.log("Deployment updated", path);
    }

    function _deploy(uint256 pk, string memory json) internal returns (ClipBoard clips) {
        MockUSD usd = MockUSD(vm.parseJsonAddress(json, ".MockUSD"));
        Character character = Character(vm.parseJsonAddress(json, ".Character"));
        SplitVault vault = SplitVault(vm.parseJsonAddress(json, ".SplitVault"));
        CommunityTreasury treasury = CommunityTreasury(vm.parseJsonAddress(json, ".CommunityTreasury"));

        // before spending gas: the file matches this chain, and this key may hand out XP rights
        require(address(vault.character()) == address(character), "SplitVault does not use this Character");
        require(address(vault.token()) == address(usd), "SplitVault does not use this MockUSD");
        require(address(treasury.vault()) == address(vault), "CommunityTreasury does not use this SplitVault");
        require(character.hasRole(character.DEFAULT_ADMIN_ROLE(), vm.addr(pk)), "PRIVATE_KEY is not the Character admin");

        vm.startBroadcast(pk);
        clips = new ClipBoard(IERC20(address(usd)), vault.registry(), character, vault, treasury, usd.decimals());
        character.grantRole(character.XP_GRANTER(), address(clips));
        vm.stopBroadcast();

        // without this role every submit, vote and win would revert
        require(character.hasRole(character.XP_GRANTER(), address(clips)), "ClipBoard did not get XP_GRANTER");
    }
}
