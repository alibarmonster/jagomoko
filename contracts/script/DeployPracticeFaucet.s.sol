// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {DeploymentFile} from "./DeploymentFile.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {PracticeFaucet} from "../src/PracticeFaucet.sol";

/// @notice Adds the $100 practice gold faucet to the live deployment and makes it a MockUSD minter,
///         leaving every other contract as it is. Run it with the key that owns MockUSD:
///
///           forge script script/DeployPracticeFaucet.s.sol --rpc-url monad_testnet              (dry run)
///           forge script script/DeployPracticeFaucet.s.sol --rpc-url monad_testnet --broadcast
///
///         Env: PRIVATE_KEY. On a broadcast it adds "PracticeFaucet" to deployments/<chainId>.json
///         and keeps every other value; a dry run leaves the file alone.
contract DeployPracticeFaucet is DeploymentFile {
    function run() external returns (PracticeFaucet faucet) {
        string memory path = _deploymentPath();
        string memory json = vm.readFile(path);
        require(!vm.keyExistsJson(json, ".PracticeFaucet"), "PracticeFaucet is already in the deployment file");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        MockUSD usd = MockUSD(vm.parseJsonAddress(json, ".MockUSD"));
        require(usd.owner() == vm.addr(pk), "PRIVATE_KEY does not own MockUSD");

        vm.startBroadcast(pk);
        faucet = new PracticeFaucet(usd);
        usd.setMinter(address(faucet), true);
        vm.stopBroadcast();

        require(usd.minters(address(faucet)), "PracticeFaucet is not a MockUSD minter");
        console2.log("PracticeFaucet", address(faucet));

        if (!_broadcasting()) {
            console2.log("Dry run: nothing was sent and", path, "was not changed");
            return faucet;
        }
        string[] memory keys = new string[](1);
        address[] memory values = new address[](1);
        (keys[0], values[0]) = ("PracticeFaucet", address(faucet));
        _record(json, path, keys, values);
        console2.log("Deployment updated", path);
    }
}
