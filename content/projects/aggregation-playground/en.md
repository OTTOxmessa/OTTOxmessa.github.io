## Why

On Boardgame Everyday I own the stats module, built on aggregation pipelines. When writing them it's easy to lose track of what the documents look like between stages — so this shows every stage's output.

## Engine

- Supports `$match` (`$gt $gte $lt $lte $in $nin $ne $exists $or $and`), `$group` (`$sum $avg $min $max $count $first $last $push $addToSet`), `$sort`, `$limit`, `$skip`, `$project`, `$count`
- Reports which stage failed and why
- Never mutates the input — covered by a test

## Accessibility

- Results are real HTML tables that screen readers can navigate
- Errors are tied to the editor and announced immediately
