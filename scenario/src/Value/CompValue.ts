import { Event } from '../Event';
import { World } from '../World';
import { Comp } from '../Contract/Comp';
import {
  getAddressV,
  getNumberV
} from '../CoreValue';
import {
  AddressV,
  ListV,
  NumberV,
  StringV,
  Value
} from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getComp } from '../ContractLookup';

export function compFetchers() {
  return [
    new Fetcher<{ comp: Comp }, AddressV>(`
        #### Address

        * "<Cvp> Address" - Returns the address of Cvp token
          * E.g. "Cvp Address"
      `,
      "Address",
      [
        new Arg("comp", getComp, { implicit: true })
      ],
      async (world, { comp }) => new AddressV(comp._address)
    ),

    new Fetcher<{ comp: Comp }, StringV>(`
        #### Name

        * "<Cvp> Name" - Returns the name of the Cvp token
          * E.g. "Cvp Name"
      `,
      "Name",
      [
        new Arg("comp", getComp, { implicit: true })
      ],
      async (world, { comp }) => new StringV(await comp.methods.name().call())
    ),

    new Fetcher<{ comp: Comp }, StringV>(`
        #### Symbol

        * "<Cvp> Symbol" - Returns the symbol of the Cvp token
          * E.g. "Cvp Symbol"
      `,
      "Symbol",
      [
        new Arg("comp", getComp, { implicit: true })
      ],
      async (world, { comp }) => new StringV(await comp.methods.symbol().call())
    ),

    new Fetcher<{ comp: Comp }, NumberV>(`
        #### Decimals

        * "<Cvp> Decimals" - Returns the number of decimals of the Cvp token
          * E.g. "Cvp Decimals"
      `,
      "Decimals",
      [
        new Arg("comp", getComp, { implicit: true })
      ],
      async (world, { comp }) => new NumberV(await comp.methods.decimals().call())
    ),

    new Fetcher<{ comp: Comp }, NumberV>(`
        #### TotalSupply

        * "Cvp TotalSupply" - Returns Cvp token's total supply
      `,
      "TotalSupply",
      [
        new Arg("comp", getComp, { implicit: true })
      ],
      async (world, { comp }) => new NumberV(await comp.methods.totalSupply().call())
    ),

    new Fetcher<{ comp: Comp, address: AddressV }, NumberV>(`
        #### TokenBalance

        * "Cvp TokenBalance <Address>" - Returns the Cvp token balance of a given address
          * E.g. "Cvp TokenBalance Geoff" - Returns Geoff's Cvp balance
      `,
      "TokenBalance",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("address", getAddressV)
      ],
      async (world, { comp, address }) => new NumberV(await comp.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ comp: Comp, owner: AddressV, spender: AddressV }, NumberV>(`
        #### Allowance

        * "Cvp Allowance owner:<Address> spender:<Address>" - Returns the Cvp allowance from owner to spender
          * E.g. "Cvp Allowance Geoff Torrey" - Returns the Cvp allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("owner", getAddressV),
        new Arg("spender", getAddressV)
      ],
      async (world, { comp, owner, spender }) => new NumberV(await comp.methods.allowance(owner.val, spender.val).call())
    ),

    new Fetcher<{ comp: Comp, account: AddressV }, NumberV>(`
        #### GetCurrentVotes

        * "Cvp GetCurrentVotes account:<Address>" - Returns the current Cvp votes balance for an account
          * E.g. "Cvp GetCurrentVotes Geoff" - Returns the current Cvp vote balance of Geoff
      `,
      "GetCurrentVotes",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { comp, account }) => new NumberV(await comp.methods.getCurrentVotes(account.val).call())
    ),

    new Fetcher<{ comp: Comp, account: AddressV, blockNumber: NumberV }, NumberV>(`
        #### GetPriorVotes

        * "Cvp GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current Cvp votes balance at given block
          * E.g. "Cvp GetPriorVotes Geoff 5" - Returns the Cvp vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("account", getAddressV),
        new Arg("blockNumber", getNumberV),
      ],
      async (world, { comp, account, blockNumber }) => new NumberV(await comp.methods.getPriorVotes(account.val, blockNumber.encode()).call())
    ),

    new Fetcher<{ comp: Comp, account: AddressV }, NumberV>(`
        #### GetCurrentVotesBlock

        * "Cvp GetCurrentVotesBlock account:<Address>" - Returns the current Cvp votes checkpoint block for an account
          * E.g. "Cvp GetCurrentVotesBlock Geoff" - Returns the current Cvp votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { comp, account }) => {
        const numCheckpoints = Number(await comp.methods.numCheckpoints(account.val).call());
        const checkpoint = await comp.methods.checkpoints(account.val, numCheckpoints - 1).call();

        return new NumberV(checkpoint.fromBlock);
      }
    ),

    new Fetcher<{ comp: Comp, account: AddressV }, NumberV>(`
        #### VotesLength

        * "Cvp VotesLength account:<Address>" - Returns the Cvp vote checkpoint array length
          * E.g. "Cvp VotesLength Geoff" - Returns the Cvp vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { comp, account }) => new NumberV(await comp.methods.numCheckpoints(account.val).call())
    ),

    new Fetcher<{ comp: Comp, account: AddressV }, ListV>(`
        #### AllVotes

        * "Cvp AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "Cvp AllVotes Geoff" - Returns the Cvp vote checkpoint array
      `,
      "AllVotes",
      [
        new Arg("comp", getComp, { implicit: true }),
        new Arg("account", getAddressV),
      ],
      async (world, { comp, account }) => {
        const numCheckpoints = Number(await comp.methods.numCheckpoints(account.val).call());
        const checkpoints = await Promise.all(new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
          const {fromBlock, votes} = await comp.methods.checkpoints(account.val, i).call();

          return new StringV(`Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`);
        }));

        return new ListV(checkpoints);
      }
    )
  ];
}

export async function getCompValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Cvp", compFetchers(), world, event);
}
