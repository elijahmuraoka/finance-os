/**
 * GraphQL query strings ported from JaviSoto/copilot-money-cli (MIT license)
 * https://github.com/JaviSoto/copilot-money-cli
 */

export const ACCOUNTS_QUERY = `
query Accounts($filter: AccountFilter, $accountLink: Boolean = false) {
  accounts(filter: $filter) {
    ...AccountFields
    accountLink @include(if: $accountLink) {
      type
      account {
        ...AccountFields
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment AccountFields on Account {
  hasHistoricalUpdates
  latestBalanceUpdate
  hasLiveBalance
  institutionId
  isUserHidden
  isUserClosed
  liveBalance
  isManual
  balance
  subType
  itemId
  limit
  color
  name
  type
  mask
  id
  __typename
}
`;

export const TRANSACTIONS_QUERY = `
query Transactions($first: Int, $after: String, $last: Int, $before: String, $filter: TransactionFilter, $sort: [TransactionSort!]) {
  transactions(
    first: $first
    after: $after
    last: $last
    before: $before
    filter: $filter
    sort: $sort
  ) {
    ...TransactionPaginationFields
    __typename
  }
}

fragment TagFields on Tag {
  colorName
  name
  id
  __typename
}

fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  id
  __typename
}

fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags {
    ...TagFields
    __typename
  }
  goal {
    ...GoalFields
    __typename
  }
  __typename
}

fragment TransactionPaginationFields on TransactionPagination {
  edges {
    cursor
    node {
      ...TransactionFields
      __typename
    }
    __typename
  }
  pageInfo {
    endCursor
    hasNextPage
    hasPreviousPage
    startCursor
    __typename
  }
  __typename
}
`;

export const CATEGORIES_QUERY = `
query Categories($spend: Boolean = false, $budget: Boolean = false, $rollovers: Boolean) {
  categories {
    ...CategoryFields
    spend @include(if: $spend) {
      ...SpendFields
      __typename
    }
    budget(isRolloverEnabled: $rollovers) @include(if: $budget) {
      ...BudgetFields
      __typename
    }
    childCategories {
      ...CategoryFields
      spend @include(if: $spend) {
        ...SpendFields
        __typename
      }
      budget(isRolloverEnabled: $rollovers) @include(if: $budget) {
        ...BudgetFields
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment SpendMonthlyFields on CategoryMonthlySpent {
  unpaidRecurringAmount
  comparisonAmount
  amount
  month
  id
  __typename
}

fragment BudgetMonthlyFields on CategoryMonthlyBudget {
  unassignedRolloverAmount
  childRolloverAmount
  unassignedAmount
  resolvedAmount
  rolloverAmount
  childAmount
  goalAmount
  amount
  month
  id
  __typename
}

fragment CategoryFields on Category {
  isRolloverDisabled
  canBeDeleted
  isExcluded
  templateId
  colorName
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  name
  id
  __typename
}

fragment SpendFields on CategorySpend {
  current {
    ...SpendMonthlyFields
    __typename
  }
  histories {
    ...SpendMonthlyFields
    __typename
  }
  __typename
}

fragment BudgetFields on CategoryBudget {
  current {
    ...BudgetMonthlyFields
    __typename
  }
  histories {
    ...BudgetMonthlyFields
    __typename
  }
  __typename
}
`;

export const BUDGETS_QUERY = `
query Budgets {
  categoriesTotal {
    budget {
      ...BudgetFields
      __typename
    }
    __typename
  }
}

fragment BudgetMonthlyFields on CategoryMonthlyBudget {
  unassignedRolloverAmount
  childRolloverAmount
  unassignedAmount
  resolvedAmount
  rolloverAmount
  childAmount
  goalAmount
  amount
  month
  id
  __typename
}

fragment BudgetFields on CategoryBudget {
  current {
    ...BudgetMonthlyFields
    __typename
  }
  histories {
    ...BudgetMonthlyFields
    __typename
  }
  __typename
}
`;

export const NETWORTH_QUERY = `
query Networth($timeFrame: TimeFrame) {
  networthHistory(timeFrame: $timeFrame) {
    ...NetworthFields
    __typename
  }
}

fragment NetworthFields on NetworthHistory {
  assets
  date
  debt
  __typename
}
`;

export const MONTHLY_SPEND_QUERY = `
query MonthlySpend {
  monthlySpending {
    comparisonAmount
    totalAmount
    date
    id
    __typename
  }
}
`;

export const TAGS_QUERY = `
query Tags {
  tags {
    ...TagFields
    __typename
  }
}

fragment TagFields on Tag {
  colorName
  name
  id
  __typename
}
`;

export const RECURRINGS_QUERY = `
query Recurrings($filter: RecurringFilter) {
  recurrings(filter: $filter) {
    ...RecurringFields
    rule {
      ...RecurringRuleFields
      __typename
    }
    payments {
      ...RecurringPaymentFields
      __typename
    }
    __typename
  }
}

fragment RecurringFields on Recurring {
  nextPaymentAmount
  nextPaymentDate
  categoryId
  frequency
  emoji
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  state
  name
  id
  __typename
}

fragment RecurringRuleFields on RecurringRule {
  nameContains
  minAmount
  maxAmount
  days
  __typename
}

fragment RecurringPaymentFields on RecurringPayment {
  amount
  isPaid
  date
  __typename
}
`;

export const SPENDS_QUERY = `
query Spends($history: Boolean = true) {
  categoriesTotal {
    spend {
      current {
        ...SpendMonthlyFields
        __typename
      }
      histories @include(if: $history) {
        ...SpendMonthlyFields
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment SpendMonthlyFields on CategoryMonthlySpent {
  unpaidRecurringAmount
  comparisonAmount
  amount
  month
  id
  __typename
}
`;

export const TRANSACTION_SUMMARY_QUERY = `
query TransactionSummary($filter: TransactionFilter) {
  transactionsSummary(filter: $filter) {
    transactionsCount
    totalNetIncome
    totalIncome
    totalSpent
    __typename
  }
}
`;

export const UPCOMING_RECURRINGS_QUERY = `
query UpcomingRecurrings {
  unpaidUpcomingRecurrings {
    ...RecurringFields
    rule {
      ...RecurringRuleFields
      __typename
    }
    payments {
      ...RecurringPaymentFields
      __typename
    }
    __typename
  }
}

fragment RecurringFields on Recurring {
  nextPaymentAmount
  nextPaymentDate
  categoryId
  frequency
  emoji
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  state
  name
  id
  __typename
}

fragment RecurringRuleFields on RecurringRule {
  nameContains
  minAmount
  maxAmount
  days
  __typename
}

fragment RecurringPaymentFields on RecurringPayment {
  amount
  isPaid
  date
  __typename
}
`;

// ─── Category Mutations ────────────────────────────────────────────────────

export const CREATE_CATEGORY_MUTATION = `
mutation CreateCategory($input: CreateCategoryInput!) {
  createCategory(input: $input) {
    ...CategoryFields
    childCategories {
      ...CategoryFields
      __typename
    }
    __typename
  }
}

fragment CategoryFields on Category {
  isRolloverDisabled
  canBeDeleted
  isExcluded
  templateId
  colorName
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  name
  id
  __typename
}
`;

export const EDIT_CATEGORY_MUTATION = `
mutation EditCategory($id: ID!, $input: EditCategoryInput!) {
  editCategory(id: $id, input: $input) {
    category {
      isRolloverDisabled
      canBeDeleted
      isExcluded
      templateId
      colorName
      icon {
        ... on EmojiUnicode {
          unicode
          __typename
        }
        ... on Genmoji {
          id
          src
          __typename
        }
        __typename
      }
      name
      id
      __typename
    }
    __typename
  }
}
`;

export const DELETE_CATEGORY_MUTATION = `
mutation DeleteCategory($id: ID!) {
  deleteCategory(id: $id)
}
`;

// ─── Holdings Queries ──────────────────────────────────────────────────────

export const HOLDINGS_QUERY = `
query Holdings {
  holdings {
    security {
      currentPrice
      lastUpdate
      symbol
      name
      type
      id
      marketInfo {
        closeTime
        openTime
        __typename
      }
      __typename
    }
    metrics {
      averageCost
      totalReturn
      costBasis
      __typename
    }
    accountId
    quantity
    itemId
    id
    __typename
  }
}
`;

export const AGGREGATED_HOLDINGS_QUERY = `
query AggregatedHoldings($timeFrame: TimeFrame, $filter: AggregatedHoldingsFilter, $accountId: ID, $itemId: ID) {
  aggregatedHoldings(timeFrame: $timeFrame, filter: $filter, accountId: $accountId, itemId: $itemId) {
    security {
      currentPrice
      lastUpdate
      symbol
      name
      type
      id
      __typename
    }
    change
    value
    __typename
  }
}
`;

// ─── Investment Queries ────────────────────────────────────────────────────

export const INVESTMENT_PERFORMANCE_QUERY = `
query InvestmentPerformance($timeFrame: TimeFrame) {
  investmentPerformance(timeFrame: $timeFrame) {
    date
    performance
    __typename
  }
}
`;

export const INVESTMENT_BALANCE_QUERY = `
query InvestmentBalance($timeFrame: TimeFrame) {
  investmentBalance(timeFrame: $timeFrame) {
    id
    date
    balance
    __typename
  }
}
`;

export const INVESTMENT_ALLOCATION_QUERY = `
query InvestmentAllocation($filter: AllocationFilter) {
  investmentAllocation(filter: $filter) {
    percentage
    amount
    type
    id
    __typename
  }
}
`;

// ─── Tag Mutations ─────────────────────────────────────────────────────────

export const CREATE_TAG_MUTATION = `
mutation CreateTag($input: CreateTagInput!) {
  createTag(input: $input) {
    colorName
    name
    id
    __typename
  }
}
`;

export const EDIT_TAG_MUTATION = `
mutation EditTag($id: ID!, $input: EditTagInput!) {
  editTag(id: $id, input: $input) {
    colorName
    name
    id
    __typename
  }
}
`;

export const DELETE_TAG_MUTATION = `
mutation DeleteTag($id: ID!) {
  deleteTag(id: $id)
}
`;

// ─── Recurring Key Metrics Query ───────────────────────────────────────────

export const RECURRING_KEY_METRICS_QUERY = `
query RecurringKeyMetrics($id: ID!) {
  recurring(id: $id) {
    id
    keyMetrics {
      averageTransactionAmount
      totalSpent
      period
      __typename
    }
    __typename
  }
}
`;

// ─── Balance History Query ─────────────────────────────────────────────────

export const BALANCE_HISTORY_QUERY = `
query BalanceHistory($itemId: ID!, $accountId: ID!, $timeFrame: TimeFrame) {
  accountBalanceHistory(itemId: $itemId, accountId: $accountId, timeFrame: $timeFrame) {
    date
    balance
    __typename
  }
}
`;

// ─── Transaction Management Mutations ──────────────────────────────────────

export const CREATE_TRANSACTION_MUTATION = `
mutation CreateTransaction($accountId: ID!, $itemId: ID!, $input: CreateTransactionInput!) {
  createTransaction(accountId: $accountId, itemId: $itemId, input: $input) {
    suggestedCategoryIds
    recurringId
    categoryId
    isReviewed
    accountId
    createdAt
    isPending
    tipAmount
    userNotes
    itemId
    amount
    date
    name
    type
    id
    tags {
      colorName
      name
      id
      __typename
    }
    __typename
  }
}
`;

export const DELETE_TRANSACTION_MUTATION = `
mutation DeleteTransaction($itemId: ID!, $accountId: ID!, $id: ID!) {
  deleteTransaction(itemId: $itemId, accountId: $accountId, id: $id)
}
`;

export const BULK_DELETE_TRANSACTIONS_MUTATION = `
mutation BulkDeleteTransactions($filter: TransactionFilter) {
  bulkDeleteTransactions(filter: $filter) {
    failed {
      transaction {
        id
        name
        __typename
      }
      error
      errorCode
      __typename
    }
    __typename
  }
}
`;

export const ADD_TRANSACTION_TO_RECURRING_MUTATION = `
mutation AddTransactionToRecurring($itemId: ID!, $accountId: ID!, $id: ID!, $input: AddTransactionToRecurringInput!) {
  addTransactionToRecurring(itemId: $itemId, accountId: $accountId, id: $id, input: $input) {
    transaction {
      suggestedCategoryIds
      recurringId
      categoryId
      isReviewed
      accountId
      createdAt
      isPending
      tipAmount
      userNotes
      itemId
      amount
      date
      name
      type
      id
      __typename
    }
    __typename
  }
}
`;

// ─── Export Transactions Query ──────────────────────────────────────────────

export const EXPORT_TRANSACTIONS_QUERY = `
query ExportTransactions($filter: TransactionFilter, $sort: [TransactionSort!]) {
  exportTransactions(filter: $filter, sort: $sort) {
    expiresAt
    url
    __typename
  }
}
`;

// ─── Refresh Connections Query ─────────────────────────────────────────────

export const REFRESH_ALL_CONNECTIONS_QUERY = `
query RefreshAllConnections {
  refreshAllConnections {
    status
    itemId
    institution {
      name
      id
      __typename
    }
    __typename
  }
}
`;

// ─── Mutations ─────────────────────────────────────────────────────────────

export const EDIT_TRANSACTION_MUTATION = `
mutation EditTransaction($itemId: ID!, $accountId: ID!, $id: ID!, $input: EditTransactionInput) {
  editTransaction(itemId: $itemId, accountId: $accountId, id: $id, input: $input) {
    transaction {
      ...TransactionFields
      __typename
    }
    __typename
  }
}

fragment TagFields on Tag {
  colorName
  name
  id
  __typename
}

fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  id
  __typename
}

fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags {
    ...TagFields
    __typename
  }
  goal {
    ...GoalFields
    __typename
  }
  __typename
}
`;

export const BULK_EDIT_TRANSACTIONS_MUTATION = `
mutation BulkEditTransactions($input: BulkEditTransactionInput!, $filter: TransactionFilter) {
  bulkEditTransactions(filter: $filter, input: $input) {
    updated {
      ...TransactionFields
      __typename
    }
    failed {
      transaction {
        ...TransactionFields
        __typename
      }
      error
      errorCode
      __typename
    }
    __typename
  }
}

fragment TagFields on Tag {
  colorName
  name
  id
  __typename
}

fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  id
  __typename
}

fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags {
    ...TagFields
    __typename
  }
  goal {
    ...GoalFields
    __typename
  }
  __typename
}
`;

export const SET_BUDGET_MUTATION = `
mutation SetBudgetAmount($categoryId: ID!, $month: String!, $input: CategoryBudgetInput!) {
  setCategoryBudget(categoryId: $categoryId, month: $month, input: $input) {
    category {
      id
      name
      __typename
    }
    budget {
      current {
        amount
        resolvedAmount
        month
        id
        __typename
      }
      histories {
        amount
        resolvedAmount
        month
        id
        __typename
      }
      __typename
    }
    __typename
  }
}
`;

// ─── Feed / Feed Queries ────────────────────────────────────────────────────

export const TRANSACTIONS_FEED_QUERY = `
query TransactionsFeed($first: Int, $after: String, $last: Int, $before: String, $filter: TransactionFilter, $sort: [TransactionSort!], $month: Boolean = false) {
  feed: transactionsFeed(
    first: $first
    after: $after
    last: $last
    before: $before
    filter: $filter
    sort: $sort
  ) {
    edges {
      cursor
      node {
        ... on TransactionMonth @include(if: $month) {
          amount
          month
          id
          __typename
        }
        ... on Transaction {
          ...TransactionFields
          __typename
        }
        __typename
      }
      __typename
    }
    pageInfo {
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
      __typename
    }
    __typename
  }
}

fragment TagFields on Tag {
  colorName
  name
  id
  __typename
}

fragment GoalFields on Goal {
  name
  icon {
    ... on EmojiUnicode {
      unicode
      __typename
    }
    ... on Genmoji {
      id
      src
      __typename
    }
    __typename
  }
  id
  __typename
}

fragment TransactionFields on Transaction {
  suggestedCategoryIds
  recurringId
  categoryId
  isReviewed
  accountId
  createdAt
  isPending
  tipAmount
  userNotes
  itemId
  amount
  date
  name
  type
  id
  tags {
    ...TagFields
    __typename
  }
  goal {
    ...GoalFields
    __typename
  }
  __typename
}
`;
