// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Payroom} from "../contracts/Payroom.sol";
import {TestDollar} from "../contracts/TestDollar.sol";
import {Safe} from "@safe-global/safe-contracts/contracts/Safe.sol";
import {SafeProxy} from "@safe-global/safe-contracts/contracts/proxies/SafeProxy.sol";
import {SafeProxyFactory} from "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import {Enum} from "@safe-global/safe-contracts/contracts/common/Enum.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
}

// Deliberately hostile token, used only to exercise rollback and reentry.
contract HostileToken {
    uint256 public mode;
    Payroom public module;
    bytes32 public target;
    bool public reentryBlocked;
    function configure(uint256 mode_, Payroom module_, bytes32 target_) external {
        mode = mode_; module = module_; target = target_;
    }
    function transfer(address, uint256) external returns (bool) {
        if (mode == 1) return false;
        if (mode == 2) revert("token failed");
        if (mode == 3) assembly { mstore(0, 1) return(31, 1) }
        if (mode == 4) {
            (bool ok, bytes memory result) = address(module).call(abi.encodeCall(module.execute, (target)));
            reentryBlocked = !ok && bytes4(result) == Payroom.Reentered.selector;
        }
        return true;
    }
    function run(bytes32 id) external { module.execute(id); }
}

contract PayroomTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Safe safe;
    Payroom module;
    TestDollar token;
    address constant KEEPER = address(0xBEEF);
    address constant RECIPIENT = address(0xCAFE);
    uint256 constant CAP = 100e6;

    function setUp() public {
        vm.warp(100 days + 10 hours);
        address[] memory owners = new address[](1); owners[0] = address(this);
        SafeProxyFactory factory = new SafeProxyFactory();
        bytes memory initializer = abi.encodeCall(Safe.setup, (owners, 1, address(0), bytes(""), address(0), address(0), 0, payable(address(0))));
        safe = Safe(payable(address(factory.createProxyWithNonce(address(new Safe()), initializer, 1))));
        require(safe.isOwner(address(this)) && safe.getThreshold() == 1);
        module = new Payroom(address(safe), KEEPER);
        token = new TestDollar(address(safe), 1000e6);
        safeCall(address(safe), abi.encodeWithSignature("enableModule(address)", address(module)));
        owner(abi.encodeCall(module.setRecipient, (RECIPIENT, true)));
        owner(abi.encodeCall(module.setDailyCap, (address(token), CAP)));
    }
    function safeCall(address to, bytes memory data) internal {
        bytes memory signature = abi.encodePacked(bytes32(uint256(uint160(address(this)))), bytes32(0), uint8(1));
        require(safe.execTransaction(to, 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), signature), "Safe call failed");
    }
    function owner(bytes memory data) internal { safeCall(address(module), data); }
    function approve(bytes32 id, uint256 amount) internal {
        owner(abi.encodeCall(module.approve, (id, RECIPIENT, address(token), amount, uint64(0))));
    }
    function pay(bytes32 id) internal { vm.prank(KEEPER); module.execute(id); }
    function state(bytes32 id) internal view returns(uint8 value) { (,,,,value) = module.invoices(id); }
    function rejects(bytes4 error, bytes32 id) internal { vm.expectRevert(error); pay(id); }

    function testOwnerEoaCannotBypassSafe() public {
        vm.expectRevert(Payroom.OnlySafe.selector); module.setPaused(true);
        vm.expectRevert(Payroom.OnlySafe.selector); module.setDailyCap(address(token), 1);
        vm.expectRevert(Payroom.OnlySafe.selector); module.setRecipient(RECIPIENT, false);
        vm.expectRevert(Payroom.OnlySafe.selector); module.setKeeper(address(this));
        vm.expectRevert(Payroom.OnlySafe.selector); module.approve(bytes32(uint256(1)), RECIPIENT, address(token), 1, 0);
        vm.expectRevert(Payroom.OnlySafe.selector); module.cancel(bytes32(uint256(1)));
    }
    function testOnlyCurrentKeeperCanPay() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1);
        vm.expectRevert(Payroom.OnlyKeeper.selector); module.execute(id);
        owner(abi.encodeCall(module.setKeeper, (address(this))));
        rejects(Payroom.OnlyKeeper.selector, id);
        module.execute(id); require(state(id) == 2);
    }
    function testRevokedRecipientBlocksPreviouslyApprovedInvoice() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1);
        owner(abi.encodeCall(module.setRecipient, (RECIPIENT, false)));
        rejects(Payroom.NotAllowed.selector, id); require(state(id) == 1);
        require(token.balanceOf(RECIPIENT) == 0);
    }
    function testZeroCapRevokesTokenAfterApproval() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1);
        owner(abi.encodeCall(module.setDailyCap, (address(token), 0)));
        rejects(Payroom.NotAllowed.selector, id); require(state(id) == 1);
    }
    function testCombinedInvoicesCannotExceedCap() public {
        approve(bytes32(uint256(1)), 60e6); approve(bytes32(uint256(2)), 60e6);
        pay(bytes32(uint256(1))); rejects(Payroom.DailyLimit.selector, bytes32(uint256(2)));
        require(token.balanceOf(RECIPIENT) == 60e6 && state(bytes32(uint256(2))) == 1);
    }
    function testCapResetUsesUtcDayBoundary() public {
        approve(bytes32(uint256(1)), CAP); approve(bytes32(uint256(2)), 1);
        pay(bytes32(uint256(1))); vm.warp(101 days - 1);
        rejects(Payroom.DailyLimit.selector, bytes32(uint256(2)));
        vm.warp(101 days); pay(bytes32(uint256(2)));
        require(module.spent(address(token), 100) == CAP && module.spent(address(token), 101) == 1);
    }
    function testLoweringCapDoesNotResetSpent() public {
        approve(bytes32(uint256(1)), 60e6); approve(bytes32(uint256(2)), 1);
        pay(bytes32(uint256(1))); owner(abi.encodeCall(module.setDailyCap, (address(token), 10e6)));
        rejects(Payroom.DailyLimit.selector, bytes32(uint256(2)));
        require(module.spent(address(token), 100) == 60e6);
    }
    function testPauseKeepsTermsAndBlocksPayment() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1);
        owner(abi.encodeCall(module.setPaused, (true))); rejects(Payroom.Paused.selector, id);
        owner(abi.encodeCall(module.setPaused, (false))); pay(id); require(state(id) == 2);
    }
    function testDueTimeIsInclusive() public {
        bytes32 id = bytes32(uint256(1));
        owner(abi.encodeCall(module.approve, (id, RECIPIENT, address(token), 1, uint64(block.timestamp + 10))));
        vm.warp(block.timestamp + 9); rejects(Payroom.NotDue.selector, id);
        vm.warp(block.timestamp + 1); pay(id); require(state(id) == 2);
    }
    function testCancelCannotBecomePaymentOrReuse() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1); owner(abi.encodeCall(module.cancel, (id)));
        rejects(Payroom.NotApproved.selector, id);
        // Safe forwards an inner revert as GS013. Either way the transaction must fail.
        (bool ok,) = address(this).call(abi.encodeCall(this.approveAgain, (id)));
        require(!ok && state(id) == 3 && token.balanceOf(RECIPIENT) == 0);
    }
    function approveAgain(bytes32 id) external { require(msg.sender == address(this)); approve(id, 1); }
    function testPaidInvoiceCannotPayTwice() public {
        bytes32 id = bytes32(uint256(1)); approve(id, 1); pay(id);
        rejects(Payroom.NotApproved.selector, id); require(token.balanceOf(RECIPIENT) == 1);
    }
    function hostile(uint256 mode) internal returns(HostileToken bad, bytes32 id) {
        bad = new HostileToken(); id = bytes32(uint256(1)); bad.configure(mode, module, id);
        owner(abi.encodeCall(module.setDailyCap, (address(bad), CAP)));
        owner(abi.encodeCall(module.approve, (id, RECIPIENT, address(bad), 5, uint64(0))));
    }
    function testFalseTokenRollsBackPaymentAndLimit() public {
        (HostileToken bad, bytes32 id) = hostile(1); rejects(Payroom.TransferFailed.selector, id);
        require(state(id) == 1 && module.spent(address(bad), 100) == 0);
        bad.configure(0, module, id); pay(id); require(state(id) == 2);
    }
    function testRevertingTokenRollsBackPaymentAndLimit() public {
        (HostileToken bad, bytes32 id) = hostile(2); rejects(Payroom.TransferFailed.selector, id);
        require(state(id) == 1 && module.spent(address(bad), 100) == 0);
    }
    function testMalformedReturnRollsBackPaymentAndLimit() public {
        (HostileToken bad, bytes32 id) = hostile(3); rejects(Payroom.TransferFailed.selector, id);
        require(state(id) == 1 && module.spent(address(bad), 100) == 0);
    }
    function testTokenReentryCannotCallAnotherInvoice() public {
        (HostileToken bad, bytes32 id) = hostile(4);
        bytes32 second = bytes32(uint256(2));
        owner(abi.encodeCall(module.approve, (second, RECIPIENT, address(bad), 5, uint64(0))));
        bad.configure(4, module, second); owner(abi.encodeCall(module.setKeeper, (address(bad))));
        bad.run(id);
        require(bad.reentryBlocked() && state(id) == 2 && state(second) == 1);
        require(module.spent(address(bad), 100) == 5);
    }
    function testFuzzExactCapTransfersOnce(uint96 raw) public {
        uint256 amount = uint256(raw) % CAP + 1; bytes32 id = bytes32(uint256(1));
        owner(abi.encodeCall(module.setDailyCap, (address(token), amount)));
        approve(id, amount); pay(id); rejects(Payroom.NotApproved.selector, id);
        require(token.balanceOf(RECIPIENT) == amount);
        require(token.balanceOf(address(safe)) == 1000e6 - amount);
        require(module.spent(address(token), 100) == amount);
    }
}
