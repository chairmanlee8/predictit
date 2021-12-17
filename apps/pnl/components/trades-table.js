const Transaction = require('@app/types/transaction');
const TradeType = require('@app/types/trade-type');
const Table = require('@app/components/table');

class TradesTable {
  constructor(domElement, transactions) {
    // CR: default sort by date descending
    this.table = new Table(
      domElement,
      [
        {
          label: 'Date',
          getValue: t => t.dateExecuted.toLocaleString('en-US')
        },
        { label: 'Market', getValue: t => t.market },
        { label: 'Contract', getValue: t => t.contract },
        {
          label: 'Type',
          getValue: t => {
            switch (t.type) {
              case TradeType.BUY_YES:
                return 'BOT Y';
              case TradeType.BUY_NO:
                return 'BOT N';
              case TradeType.SELL_YES:
                return 'SLD Y';
              case TradeType.SELL_NO:
                return 'SLD N';
              case TradeType.CLOSED:
                return 'CLOSED';
            }
          }
        },
        {
          label: 'Price/size',
          class: 'monospace',
          getValue: t => `${t.price.toFixed(2)} x ${t.shares}`
        },
        { label: 'P/L', class: 'monospace', getValue: t => t.profitLoss },
        { label: 'Fees', class: 'monospace', getValue: t => t.fees }
      ],
      transactions
    );
  }

  update(transactions) {
    this.table.update(transactions);
    this.table.render();
  }
}

module.exports = TradesTable;
