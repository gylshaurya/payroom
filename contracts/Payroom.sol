// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ISafe {
    function execTransactionFromModuleReturnData(address to, uint256 value, bytes memory data, uint8 operation)
        external returns (bool success, bytes memory returnData);
}

/// @notice A testnet invoice module for one Safe. The Safe approves terms; its keeper can only execute them.
contract Payroom {
    struct Invoice { address recipient; address token; uint256 amount; uint64 due; uint8 state; }
    ISafe public immutable safe;
    address public keeper;
    bool public paused;
    mapping(address => bool) public recipients;
    mapping(address => uint256) public dailyCaps;
    mapping(address => mapping(uint256 => uint256)) public spent;
    mapping(bytes32 => Invoice) public invoices;
    bool private entered;

    error OnlySafe(); error OnlyKeeper(); error InvalidTerms(); error NotAllowed();
    error UsedInvoice(); error NotApproved(); error NotDue(); error Paused();
    error DailyLimit(); error TransferFailed(); error Reentered();
    event Approved(bytes32 indexed id, address indexed recipient, address indexed token, uint256 amount, uint64 due);
    event Paid(bytes32 indexed id, address indexed recipient, address indexed token, uint256 amount);
    event Cancelled(bytes32 indexed id);
    event RecipientSet(address indexed recipient, bool allowed);
    event CapSet(address indexed token, uint256 cap);
    event PauseSet(bool paused);
    event KeeperSet(address indexed keeper);

    modifier onlySafe() { if (msg.sender != address(safe)) revert OnlySafe(); _; }
    constructor(address safe_, address keeper_) {
        if (safe_.code.length == 0 || keeper_ == address(0)) revert InvalidTerms();
        safe = ISafe(safe_); keeper = keeper_;
    }
    function setKeeper(address next) external onlySafe {
        if (next == address(0)) revert InvalidTerms(); keeper = next; emit KeeperSet(next);
    }
    function setRecipient(address recipient, bool allowed) external onlySafe {
        if (recipient == address(0) || recipient == address(safe) || recipient == address(this)) revert InvalidTerms();
        recipients[recipient] = allowed; emit RecipientSet(recipient, allowed);
    }
    function setDailyCap(address token, uint256 cap) external onlySafe {
        if (token.code.length == 0) revert InvalidTerms();
        dailyCaps[token] = cap; emit CapSet(token, cap);
    }
    function setPaused(bool value) external onlySafe { paused = value; emit PauseSet(value); }
    function approve(bytes32 id, address recipient, address token, uint256 amount, uint64 due) external onlySafe {
        if (id == bytes32(0) || amount == 0) revert InvalidTerms();
        if (invoices[id].state != 0) revert UsedInvoice();
        if (!recipients[recipient] || dailyCaps[token] == 0) revert NotAllowed();
        if (amount > dailyCaps[token]) revert DailyLimit();
        invoices[id] = Invoice(recipient, token, amount, due, 1);
        emit Approved(id, recipient, token, amount, due);
    }
    function cancel(bytes32 id) external onlySafe {
        if (invoices[id].state != 1) revert NotApproved();
        invoices[id].state = 3; emit Cancelled(id);
    }
    function execute(bytes32 id) external {
        if (entered) revert Reentered();
        if (msg.sender != keeper) revert OnlyKeeper();
        if (paused) revert Paused();
        Invoice storage invoice = invoices[id];
        if (invoice.state != 1) revert NotApproved();
        if (block.timestamp < invoice.due) revert NotDue();
        if (!recipients[invoice.recipient] || dailyCaps[invoice.token] == 0) revert NotAllowed();
        uint256 day = block.timestamp / 1 days;
        uint256 total = spent[invoice.token][day] + invoice.amount;
        if (total > dailyCaps[invoice.token]) revert DailyLimit();
        entered = true;
        invoice.state = 2;
        spent[invoice.token][day] = total;
        (bool success, bytes memory result) = safe.execTransactionFromModuleReturnData(
            invoice.token, 0, abi.encodeWithSignature("transfer(address,uint256)", invoice.recipient, invoice.amount), 0
        );
        if (!success || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) revert TransferFailed();
        entered = false;
        emit Paid(id, invoice.recipient, invoice.token, invoice.amount);
    }
}
