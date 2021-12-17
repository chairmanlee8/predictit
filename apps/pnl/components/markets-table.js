const Transaction = require('@app/types/transaction');
const TradeType = require('@app/types/trade-type');
const Table = require('@app/components/table');

function format(transactions) {
  const summary = {};

  transactions.sort(Transaction.ascending);

  for (const t of transactions) {
    if (!summary.hasOwnProperty(t.market)) {
      summary[t.market] = {
        profitLoss: 0,
        fees: 0,
        buyDollars: 0,
        buyShares: 0,
        sellOrCloseDollars: 0,
        sellOrCloseShares: 0
      };
    }

    summary[t.market].profitLoss += t.profitLoss;
    summary[t.market].fees += t.fees;

    switch (t.type) {
      case TradeType.BUY_YES:
      case TradeType.BUY_NO:
        summary[t.market].buyDollars += t.price * t.shares;
        summary[t.market].buyShares += t.shares;
        break;
      case TradeType.SELL_YES:
      case TradeType.SELL_NO:
      case TradeType.CLOSED:
        summary[t.market].sellOrCloseDollars += t.price * t.shares;
        summary[t.market].sellOrCloseShares += t.shares;
        break;
    }
  }

  const data = [];

  for (const market in summary) {
    data.push([
      market,
      summary[market].buyDollars / summary[market].buyShares,
      summary[market].sellOrCloseDollars / summary[market].sellOrCloseShares,
      summary[market].profitLoss,
      summary[market].fees,
      summary[market].profitLoss + summary[market].fees
    ]);
  }

  return data;
}

// e.g. -9999.99 fixed width
function formatMoney(x) {
  let wholePart = Math.trunc(Math.abs(x)).toString();
  wholePart = x < 0 ? '-' + wholePart : wholePart;
  let fractionalPart2 = Math.trunc(Math.abs(x - wholePart) * 100).toString();
  return `${wholePart.padStart(5, ' ')}.${fractionalPart2.padStart(2, '0')}`;
}

class MarketsTable {
  constructor(domElement, transactions) {
    this.table = new Table(
      domElement,
      [
        { label: 'Market', getValue: a => a[0] },
        {
          label: 'VWAP (buy)',
          class: 'monospace money',
          getValue: a => formatMoney(a[1]),
          sortValue: a => a[1]
        },
        {
          label: 'VWAP (sell/close)',
          class: 'monospace money',
          getValue: a => formatMoney(a[2]),
          sortValue: a => a[2]
        },
        {
          label: 'P/L',
          class: 'monospace money',
          getValue: a => formatMoney(a[3]),
          sortValue: a => a[3]
        },
        {
          label: 'Fees',
          class: 'monospace money',
          getValue: a => formatMoney(a[4]),
          sortValue: a => a[4]
        },
        {
          label: 'Net P/L',
          class: 'monospace money',
          getValue: a => formatMoney(a[5]),
          sortValue: a => a[5]
        }
      ],
      format(transactions)
    );
  }

  update(transactions) {
    this.table.update(format(transactions));
    this.table.render();
  }
}

module.exports = MarketsTable;
