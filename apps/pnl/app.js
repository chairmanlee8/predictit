require('module-alias/register');

const fs = require('fs');
const parse = require('csv-parse/lib/sync');
const Transaction = require('@app/types/transaction');
const TradeType = require('@app/types/trade-type');
const SummaryBar = require('@app/components/summary-bar');
const PNLGraph = require('@app/components/pnl-graph');
const MarketsTable = require('@app/components/markets-table');
const TradesTable = require('@app/components/trades-table');

function priceIsNegative(price) {
  return price[0] == '(' && price[1] == '$' && price[price.length - 1] == ')';
}

function priceToNumber(price) {
  // e.g. $1.00 to 100, or ($1.00) to -100
  if (price.length < 2 || !(price[0] == '$' || priceIsNegative(price)))
    throw `Unexpected price format: ${price}`;
  else if (priceIsNegative(price)) {
    return -parseFloat(price.slice(2, price.length - 1));
  } else {
    return parseFloat(price.slice(1, price.length));
  }
}

function typeToEnum(type) {
  switch (type) {
    case 'Buy Yes':
      return TradeType.BUY_YES;
    case 'Buy No':
      return TradeType.BUY_NO;
    case 'Sell Yes':
      return TradeType.SELL_YES;
    case 'Sell No':
      return TradeType.SELL_NO;
    case 'Closed':
      return TradeType.CLOSED;
    default:
      throw `Unexpected transaction type: ${type}`;
  }
}

fs.readFile('TradeHistory.csv', 'utf8', (err, contents) => {
  if (err) {
    document.write(err);
  } else {
    let rows = parse(contents, {
      columns: true,
      skip_empty_lines: true,
      relax: true,
      cast: (value, context) => {
        switch (context.column) {
          case 'DateExecuted':
            return new Date(value + ' UTC');
          case 'Type':
            return typeToEnum(value);
          case 'Shares':
            return parseInt(value);
          case 'Price':
          case 'ProfitLoss':
          case 'Fees':
          case 'Risk':
          case 'CreditDebit':
            return priceToNumber(value);
          default:
            return value;
        }
      }
    });

    let transactions = rows.map(row => {
      return new Transaction({
        market: row['MarketName'],
        contract: row['ContractName'],
        dateExecuted: row['DateExecuted'],
        type: row['Type'],
        shares: row['Shares'],
        price: row['Price'],
        profitLoss: row['ProfitLoss'],
        fees: row['Fees'],
        risk: row['Risk'],
        creditDebit: row['CreditDebit']
      });
    });

    function filterTranscations(
      transactions,
      { minDate = null, maxDate = null, regex = null } = {}
    ) {
      return _.filter(transactions, t => {
        return (
          (minDate ? t.dateExecuted >= minDate : true) &&
          (maxDate ? t.dateExecuted <= maxDate : true) &&
          (regex ? regex.test(t.market) || regex.test(t.contract) : true)
        );
      });
    }

    const summaryBar = new SummaryBar(
      document.getElementById('summary'),
      transactions
    );
    const pnlGraph = new PNLGraph(
      document.getElementById('graph'),
      transactions
    );
    const tradesTable = new TradesTable(
      document.getElementById('trades'),
      transactions
    );
    const marketsTable = new MarketsTable(
      document.getElementById('markets'),
      transactions
    );

    let filterMinDate = null;
    let filterMaxDate = null;
    let filterRegex = null;

    function updateView() {
      let filteredTransactions = filterTranscations(transactions, {
        regex: filterRegex,
        minDate: filterMinDate,
        maxDate: filterMaxDate
      });

      pnlGraph.update(
        transactions,
        transactions.length == filteredTransactions.length
          ? []
          : filteredTransactions
      );
      summaryBar.update(filteredTransactions);
      marketsTable.update(filteredTransactions);
      tradesTable.update(filteredTransactions);
    }

    pnlGraph.onZoom((minDate, maxDate) => {
      filterMinDate = minDate;
      filterMaxDate = maxDate;
      updateView();
    });

    const selector = document.querySelectorAll(
      '#selector form input[name="toggle"]'
    );
    selector.forEach(el =>
      el.addEventListener('change', event => {
        const allValues = ['markets', 'trades'];
        if (allValues.indexOf(event.target.value) > -1) {
          allValues.forEach(id => {
            if (id === event.target.value) {
              document.getElementById(id).style.display = null;
            } else {
              document.getElementById(id).style.display = 'none';
            }
          });
        }
      })
    );
    selector.value = 'trades';

    const filter = document.getElementById('filter');
    filter.addEventListener(
      'keyup',
      _.debounce(event => {
        filterRegex = new RegExp(event.target.value, 'i');
        updateView();
      }, 500)
    );
  }
});
