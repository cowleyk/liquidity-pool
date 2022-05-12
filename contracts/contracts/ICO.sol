//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SpaceCoin.sol";
import "./interfaces/IRouter.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title A contract for raising ICO funds
/// @author Kevin Cowley
contract ICO is Ownable {
    /// @dev This implementation using `SpaceCoin` does not need SafeERC20
    /// This was added in case `SpaceCoin` is swapped out for a token that isn't based
    /// off openzeppelin's ERC20
    using SafeERC20 for IERC20;

    /// @notice owner of the contract with special permissions
    address public immutable treasury;

    /// @notice addresses allow to contribute during Phase Seed
    mapping(address => bool) public whitelist;

    /// @notice contract's value
    uint256 public totalAmountRaised;

    /// @notice tracks how much wei an individual has contributed
    mapping(address => uint256) public userContributions;

    /// @notice Phase Seed, General, or Open
    Phase public currentPhase;
    enum Phase {
        SEED,
        GENERAL,
        OPEN
    }

    /// @notice toggle controlled by `treasury` to pause/resume collection contributions
    bool public isPaused;

    /// @notice token that will be distributed
    IERC20 public token;

    /// @notice SPC per ETH
    uint256 public constant RATE = 5;

    string private constant INCORRECT_PHASE = "INCORRECT_PHASE";

    /// @notice Guard against reentrancy
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;
    modifier nonReentrant() {
        require(_status != _ENTERED, "REENTRANT_CALL");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    /// @notice state change events
    event PhaseAdvanced(string _newPhase);
    event UserContribution(address indexed _contributor, uint256 _amount);
    event AddressWhitelisted(address _contributor);
    event ICOStatusChange(string _newStatus);
    event ContributionsWithdrawn();
    event TokensCollected(address indexed _contributor, uint256 _amount);

    constructor(address[] memory _whitelist) public {
        treasury = msg.sender;

        uint256 length = _whitelist.length;
        for (uint256 i = 0; i < length; ) {
            whitelist[_whitelist[i]] = true;
            unchecked {
                i++;
            }
        }
    }

    modifier onlyTreasury() {
        require(msg.sender == treasury, "ONLY_TREASURY");
        _;
    }

    /// @dev check if msg.sender is able to contribute
    /// whitelist is only applicable during Phase Seed
    function whitelisted() internal view returns (bool) {
        if (currentPhase != Phase.SEED) {
            return true;
        }
        return whitelist[msg.sender];
    }

    function getMaxIndividualContribution(Phase _currentPhase)
        public
        pure
        returns (uint256 maxContribution)
    {
        if (_currentPhase == Phase.SEED) {
            maxContribution = 1500 ether;
        } else if (_currentPhase == Phase.GENERAL) {
            maxContribution = 1000 ether;
        } else {
            maxContribution = 30_000 ether;
        }
    }

    function getMaxPhaseContribution(Phase _currentPhase)
        public
        pure
        returns (uint256 maxContribution)
    {
        if (_currentPhase == Phase.SEED) {
            maxContribution = 15_000 ether;
        } else {
            maxContribution = 30_000 ether;
        }
    }

    /// @notice buy SPC
    /// total contributions must be under or exactly equal to the phase goal to be valid
    function buy() external payable {
        require(!isPaused, "PAUSED_CAMPAIGN");
        require(
            userContributions[msg.sender] + msg.value <=
                getMaxIndividualContribution(currentPhase),
            "EXCEEDS_MAX_CONTRIBUTION"
        );
        require(
            totalAmountRaised + msg.value <=
                getMaxPhaseContribution(currentPhase),
            "INSUFFICIENT_AVAILABILITY"
        );
        require(whitelisted(), "WHITELIST");

        userContributions[msg.sender] += msg.value;
        totalAmountRaised += msg.value;
        emit UserContribution(msg.sender, msg.value);

        /// @notice if the contribution caps out the current phase, advance to the next phase
        if (
            totalAmountRaised == getMaxPhaseContribution(currentPhase) &&
            currentPhase != Phase.OPEN
        ) {
            _advancePhase(currentPhase);
        }
    }

    /// @dev private function only available to this contract for programatically advancing
    /// @notice call `advancePhase()` from the treasury address to advance phases from outside this contract
    /// @notice this MUST be a separate function to allow for the onlyTreasury modifier AND for it to be called internally
    function _advancePhase(Phase expectedCurrentPhase) private {
        /// @notice Guard against calling advancePhase too many times
        require(expectedCurrentPhase == currentPhase, INCORRECT_PHASE);
        require(
            currentPhase == Phase.SEED || currentPhase == Phase.GENERAL,
            INCORRECT_PHASE
        );

        currentPhase = Phase(uint256(currentPhase) + 1);
        emit PhaseAdvanced(currentPhase == Phase.GENERAL ? "General" : "Open");

        /// @notice once Phase Open is reached, mint the SPC
        /// @dev SpaceCoin is initialized at end of SPC to avoid
        /// having to build transfer locks into the SPC contract
        if (currentPhase == Phase.OPEN) {
            token = new SpaceCoin();
        }
    }

    /// @notice accessible function for treasury to manually advance phases
    function advancePhase(Phase expectedCurrentPhase) external onlyTreasury {
        _advancePhase(expectedCurrentPhase);
    }

    /// @notice add address to whitelist (treasury only)
    /// @notice specify toWhitelist = false to remove an address
    function whitelistAddress(address newAddress, bool toWhitelist)
        external
        onlyTreasury
    {
        whitelist[newAddress] = toWhitelist;
        emit AddressWhitelisted(newAddress);
    }

    /// @notice allow treasury to pause/resume SPC purchasing
    function toggleIsPaused(bool pause) external onlyTreasury {
        isPaused = pause;
        emit ICOStatusChange(pause ? "Paused" : "Resumed");
    }

    /// @notice pull method for contributors to collect their tokens once Phase Open starts
    function collectTokens() external nonReentrant {
        require(currentPhase == Phase.OPEN, INCORRECT_PHASE);
        require(userContributions[msg.sender] > 0, "NO_TOKENS");

        /// @notice each user is granted 5 SPC per 1 ETH
        uint256 amount = userContributions[msg.sender] * RATE;
        delete userContributions[msg.sender];
        token.safeTransfer(msg.sender, amount);
        emit TokensCollected(msg.sender, amount);
    }

    /// @notice allow treasury to collect funds once the ICO ends
    function withdrawContributions() external onlyTreasury nonReentrant {
        require(totalAmountRaised == 30000 ether, "ICO_ACTIVE");
        uint256 withdrawalAmount = totalAmountRaised;
        delete totalAmountRaised;

        (bool sent, ) = treasury.call{value: withdrawalAmount}("");
        require(sent, "WITHDRAWAL_FAILURE");
        emit ContributionsWithdrawn();
    }
}
