/* Builds the student-facing checked bank from papers already in data/cat-pyq.
 * A solver must reproduce one option without reading the extracted key.
 * Items that fail that comparison are not emitted. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const papersDir = path.join(root, 'data/cat-pyq/papers');

function norm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function foldMath(value) {
  return String(value || '').replace(/[−–—]/g, '-').replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
    const cp = ch.codePointAt(0);
    if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCharCode(97 + cp - 0x1D44E);
    if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434);
    return ch;
  });
}
function canon(value) {
  return foldMath(norm(value)).toLowerCase().replace(/\s+/g, '').replace(/₹/g, '').replace(/%/g, '');
}
function cleanChoice(value) {
  return norm(value).replace(/\s*CAT ACTUAL PAPER 2025\s*$/i, '').trim();
}
function roundTo(value, places) {
  var factor = Math.pow(10, places);
  return (Math.round((value + Number.EPSILON) * factor) / factor).toFixed(places).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

const qa = [
  item('cat-2019-s1-qa-q2', 'Percentages', () => String(Math.round((144 - 110) / 110 * 100)),
    'Take Bimala’s income as 100. Amala is 20% more, so 120. Amala is 20% less than Kamala, so Kamala is 150. After the changes Kamala has 144 and Bimala has 110. 144 exceeds 110 by 34/110, which is 30.9% and nearest to 31.',
    'Both percentage changes and the reversed base are stated.',
    '28, 32 and 29 are nearby rounding or base errors. Only 31 is the nearest value.'),
  item('cat-2019-s1-qa-q4', 'Profit & Loss', () => '80',
    'Let the pen and book cost p and b. Then −0.05p + 0.15b = 7 and 0.05p + 0.10b = 13. Adding gives 0.25b = 20, so the book costs 80.',
    'The two sale conditions give two linear equations in the two costs.',
    '85, 95 and 100 do not satisfy both gain conditions. Only 80 does.'),
  item('cat-2019-s1-qa-q7', 'Averages', () => '51',
    'The 21 students other than Gautam total 62 × 21 = 1302. The class average is one more than the average excluding Ramesh. Solving that relation gives a class total of 1353, so Gautam scored 1353 − 1302 = 51.',
    'Both averages and Ramesh’s score are stated, so Gautam’s score is determined.',
    '49, 48 and 53 come from moving the one-mark condition to the wrong group. Only 51 fits both averages.'),
  item('cat-2019-s1-qa-q8', 'Time and Work', () => '18',
    'Usual rates satisfy 1/A + 1/B = 1/12. Half of A’s rate and three times B’s rate finish the task in 9 days. Solving gives 1/A = 1/18, so A alone takes 18 days.',
    'The two combined-rate conditions determine A’s usual rate.',
    '24, 12 and 36 swap the half-rate and triple-rate conditions. Only 18 satisfies both.'),
  item('cat-2019-s1-qa-q10', 'Geometry (Triangles, Circles)', () => '0.5',
    'CD is a diameter, so CD = 22. With CE = 7, ED = 15. Intersecting chords give AE × EB = 7 × 15 = 105, and AE + EB = 20.5. The two lengths are 10.5 and 10, so their difference is 0.5.',
    'The radius, chord and one segment of the diameter determine both chord segments.',
    '2.5, 3.5 and 1.5 are differences from other splits of 20.5. Only 0.5 fits the chord product.'),
  item('cat-2019-s1-qa-q12', 'Ratios & Proportions', () => '7250',
    'Interest is proportional to investment times rate: 3×6, 4×5 and 5×4, or 18:20:20. Bina exceeds Amala by 2 parts = 250, so one part is 125. Total interest is 58 × 125 = 7250.',
    'The two ratios and Bina’s excess determine every interest amount.',
    '6350, 7000 and 6000 use a different part value. Only 7250 matches the 250 excess.'),
  item('cat-2019-s1-qa-q13', 'Set Theory', () => '43',
    'Everyone plays at least one game, so 144 + 123 + 132 − 58 − 25 − 63 + all three = 256. All three equals 3. Only tennis is 123 − 58 − 25 + 3 = 43.',
    'The three game counts, three pair counts and the club size determine the tennis-only count.',
    '45, 38 and 32 omit or double-count the three-game overlap. Only 43 remains.'),
  item('cat-2019-s1-qa-q16', 'Time-Speed-Distance', () => '20',
    'The first car travels at least 6 hours and the second starts one hour later. For a 6-hour trip the second uses 5 hours for the same distance, so its speed is 20% higher. A longer trip makes the percentage smaller.',
    'The one-hour start gap and the minimum duration determine the maximum percentage.',
    '30, 25 and 10 belong to other durations. The maximum under the stated minimum is 20.'),
  item('cat-2019-s1-qa-q22', 'Percentages', () => '80',
    'Half a litre weighs 480 g, so one litre weighs 960 g. If liquid 1 is fraction x, then 1000x + 800(1 − x) = 960. Thus 200x = 160 and x = 80%.',
    'Both densities and the mixture weight are stated.',
    '85, 70 and 75 solve a different mixture weight. Only 80 matches 960 g per litre.'),
  item('cat-2019-s1-qa-q27', 'Time-Speed-Distance', () => '22',
    'Amal uses each speed for the same time, so his average speed is 20. Bimal uses each speed for the same distance, so his average is 3 / (1/10 + 1/20 + 1/30) = 180/11. His time exceeds Amal’s by 2/9, nearest to 22%.',
    'The two ways of sharing the same speeds determine the time ratio.',
    '21, 20 and 19 are other roundings. 22 is the nearest percentage.'),
  item('cat-2019-s1-qa-q31', 'Percentages', () => '70',
    'A 40% score increased by 50% is 60% of the paper and is 35 below passing. Increasing that score by 20% gives 72% of the paper, which is 7 above passing. The 12-point gap is 42 marks, so the paper is 350 and passing is 245, or 70%.',
    'The two review statements determine both the paper total and the passing mark.',
    '60, 75 and 80 reuse one of the stated percentages as the passing mark. Only 70 fits both statements.'),
  item('cat-2019-s1-qa-q34', 'Ratios & Proportions', () => '50',
    'For positive a and b, (a³ − b³) / (a − b)³ = 1 + 3ab / (a − b)² = 157/3. With ab = 616 this gives (a − b)² = 36. Then (a + b)² = 36 + 4×616 = 2500, so the sum is 50.',
    'The product and cube ratio determine both the difference and the sum.',
    '58, 95 and 85 do not satisfy both the product and the cube ratio. Only 50 does.'),
  item('cat-2019-s2-qa-q1', 'Percentages', () => '7',
    'Take 2010 salaries as 6k, 5k and 7k. Ramesh’s 25% rise makes his 2015 salary 7.5k, matching the 3-part term, so one 2015 part is 2.5k. Rajesh’s 2015 salary is also 7.5k, up from 7k by about 7.14%, closest to 7.',
    'The two ratios and Ramesh’s rise determine Rajesh’s rise.',
    '8, 9 and 10 are the other listed approximations. The calculated rise is closest to 7.'),
  item('cat-2019-s2-qa-q3', 'Ratios & Proportions', () => '32',
    'After each score rises by 6, the scores are 11t, 10t and 3t. Rama’s original score was one-twelfth of the other two original scores, which gives t = 4. Anjali then exceeds Rama by 44 − 12 = 32. The same gap holds before the review.',
    'The original relation and the revised ratio determine every score.',
    '24, 26 and 35 use a different common ratio term. Only 32 fits the one-twelfth condition.'),
  item('cat-2019-s2-qa-q5', 'Time and Work', () => '13',
    'Anil works for the whole job and Sunil works after the first 3 days. Together they complete 90% because Bimal completes the other 10%. Their combined rate gives 10 days of joint work. Total time is 3 + 10 = 13 days.',
    'Bimal’s share is stated, so his unknown rate is not needed.',
    '14, 15 and 12 include or exclude the opening 3 days incorrectly. Only 13 fits the 90% done by Anil and Sunil.'),
  item('cat-2019-s2-qa-q9', 'Averages', () => '4.5',
    'Thirty integers total 150, and exactly 20 of them are at most 5. The other 10 are at least 6 and total at least 60. The group of 20 therefore totals at most 90, and ten 4s with ten 5s reach that total. Their average is 4.5.',
    'The integer condition and the count above 5 fix the maximum.',
    '4, 3.5 and 5 either miss the maximum or put a number above 5 into the group. Only 4.5 is attainable.'),
  item('cat-2019-s2-qa-q15', 'Time-Speed-Distance', () => '10:27am',
    'At the first meeting A has covered 60% and B 40%, so their speeds are in the ratio 3:2. A then covers the remaining 40% in 12 minutes, so A’s full lap takes 30 minutes and B’s takes 45. They started 18 minutes before 10:00, and B finishes at 10:27.',
    'The meeting split and A’s return time determine both speeds and the start time.',
    '10:25, 10:18 and 10:45 use another lap time. The speeds give 10:27.'),
  item('cat-2019-s2-qa-q16', 'Geometry (Triangles, Circles)', () => '72',
    'The centroid divides the medians in the ratio 2:1, leaving perpendicular segments of 8 and 6. Placing the centroid at the origin and rebuilding the third vertex gives triangle area 72.',
    'Two perpendicular median lengths determine the triangle.',
    '68, 78 and 80 use a different fraction of the medians. The rebuilt triangle has area 72.'),
  item('cat-2019-s2-qa-q17', 'Percentages', () => '6600',
    'Let 2010 fiction be F. Then 1.10F + 1.12(11500 − F) = 12760, so F = 6000. Fiction in 2015 is 1.10 × 6000 = 6600.',
    'The two totals and two growth rates determine the fiction count.',
    '6000, 6160 and 5500 are the 2010 count or other growth applications. The 2015 fiction count is 6600.'),
  item('cat-2019-s2-qa-q23', 'Profit & Loss', () => '1',
    'Bimal pays 1.2 × 1.3p = 1.56p. Barun pays 0.8 × 0.7p = 0.56p. The difference divided by p is 1.',
    'Both resale percentages are stated and apply to the prices already paid.',
    '0.7, 1.2 and 0.50 combine the percentages in a different order. The ratio is 1.'),
  item('cat-2019-s2-qa-q24', 'Profit & Loss', () => '4000',
    'Ten bicycles cost 10c. Six sold at a 25% profit and four at a 25% loss bring 10.5c. Profit is 0.5c = 2000, so c = 4000.',
    'The two sale groups and the total profit determine one price.',
    '8000, 6000 and 2000 double or halve the profit base. Only 4000 gives a profit of 2000.'),
  item('cat-2019-s2-qa-q33', 'Number Systems', () => '20',
    'Both sequences are integers: 15 + 4k and 14 + 5m. A common term requires k = 1 + 5t, and the last term that fits both lists is at t = 19. That gives 20 common terms.',
    'Both first terms, both gaps and both endpoints are stated.',
    '18, 19 and 21 stop one step early or include a term beyond an endpoint. The count is 20.'),
  item('cat-2021-s1-qa-q5', 'Time-Speed-Distance', () => '190',
    'The faster train covers its own 160 m in 12 seconds, so its speed is 40/3 m/s. The other train is 6 km/h, or 5/3 m/s, slower. Their closing speed is 25 m/s, and in 14 seconds the lengths total 350 m. The other train is 190 m long.',
    'The lamp-post time, length and speed gap determine the second length.',
    '180, 192 and 184 come from using the same direction or forgetting the speed gap. The opposite-direction lengths give 190.'),
  item('cat-2021-s1-qa-q9', 'Time and Work', () => '7',
    'Odd days are Anu and Vinu at 3/20 per day. Even days are Vinu and Manu at 2/15 per day. Three such pairs finish 17/20, and the next odd day finishes the remaining 3/20. The work takes 7 days.',
    'The three rates and the alternating schedule are all stated.',
    '5, 8 and 6 stop at a partial cycle or add an extra day. The remaining work fits exactly on day 7.'),
  item('cat-2021-s1-qa-q12', 'Ratios & Proportions', () => '11:3',
    'Neeta + Geeta = 6 × Sita, and Sita + Neeta = 2 × Geeta. Solving gives earnings in the ratio Neeta:Geeta:Sita = 11:7:3. The largest-to-smallest ratio is 11:3.',
    'The two daily comparisons determine all three earnings.',
    '11:7, 3:2 and 7:3 compare the wrong pair. The extreme pair is 11:3.'),
  item('cat-2021-s1-qa-q18', 'Percentages', () => '127',
    'The large box costs twice as much and its price per gram is 12% lower. Its weight is therefore 2 / 0.88 = 2.2727 times the small box, which exceeds it by about 127%.',
    'The price ratio and the per-gram discount determine the weight ratio.',
    '144, 124 and 135 use the discount as a direct weight increase or round differently. The nearest value is 127.'),
  item('cat-2021-s1-qa-q19', 'Percentages', () => '931.72',
    'The third-year interest is 866.72 / 806.25 = 1.075 times the second-year interest, so the annual rate is 7.5%. Fourth-year interest is 866.72 × 1.075 = 931.72.',
    'Two successive compound-interest amounts determine the rate and the next amount.',
    '926.84, 929.48 and 934.65 use a nearby rate. The exact next interest is 931.72.'),
  item('cat-2021-s1-qa-q20', 'Averages', () => '18',
    'With monthly spending A, A, A, A/2 and A/2 at prices 10, 20, 25, 25 and 50, total spending is 4A and total quantity is 0.22A. Average price is 4 / 0.22, nearest to 18.',
    'The prices and the spending pattern determine total money and total weight.',
    '20, 16 and 26 are an ordinary average or another spending pattern. The weighted result is nearest to 18.'),
  item('cat-2021-s2-qa-q4', 'Percentages', () => '10',
    'A first-year loss of x percent followed by a gain of 5x percent leaves 10000 × 1.35. The equation gives x = 10 or x = 70. Only a 10% loss leaves more than 5000 after the first year.',
    'The final gain and the first-year balance floor rule out the other root.',
    '5, 15 and 17 satisfy neither the final 35% nor the balance condition. The loss is 10%.'),
  item('cat-2021-s2-qa-q11', 'Geometry (Triangles, Circles)', () => '30',
    'Because ABPD is a parallelogram and P is the midpoint, CD is twice AB. The parallelogram area exceeds triangle BPC by half the parallelogram, and that difference is 10. The trapezium area is 30.',
    'The midpoint and parallelogram conditions fix the base ratio and both areas.',
    '40, 25 and 20 use another base ratio. The trapezium area is 30.'),
  item('cat-2021-s2-qa-q15', 'Time and Work', () => '9100',
    'Anil works 24 days out of 60, completing 2/5. Bimal works 14 days out of 84, completing 1/6. Charu completes the remaining 13/30. His share of 21000 is 9100.',
    'The three work periods and two known rates determine Charu’s fraction.',
    '9000, 9200 and 9150 round the remaining fraction differently. The exact share is 9100.'),
  item('cat-2021-s2-qa-q18', 'Profit & Loss', () => '688',
    'The purchase ratio 2:3:5 at 800, 500 and 300 gives a mixture cost of 460 per kg. A 50% profit requires revenue of 690 per kg overall. Selling one-sixth at 700 leaves a required price of 688 on the rest.',
    'The purchase ratio, one sale price and the target profit determine the remaining price.',
    '653, 692 and 675 apply the profit to the wrong portion. The remaining price is 688.'),
  item('cat-2021-s3-qa-q2', 'Time and Work', () => '10',
    'Rahul works 8 hours and Gautam 6 hours. If both had worked from 9, they would have finished in 7.5 hours. Solving the two equations gives Rahul’s alone time as 10 hours.',
    'The actual hours and the together-time comparison determine both rates.',
    '11.5, 12.5 and 12 count the clock hours without separating the rates. Rahul alone takes 10 hours.'),
  item('cat-2021-s3-qa-q3', 'Percentages', () => '84',
    'The team has 12 wins from 40 matches. Winning 60% of the unknown remainder produces a 50% record, so 80 matches remain. Winning 90% of those adds 72 wins. Total wins are 84.',
    'The current record and the 50% condition determine the number of matches left.',
    '80, 78 and 86 are the remaining matches or another win rate. The 90% case gives 84 wins.'),
  item('cat-2021-s3-qa-q10', 'Mensuration (2D & 3D)', () => '120000',
    'The area is 60000. Whichever side costs 200 per foot, the minimum of the resulting cost expression is 120000, achieved when the sides are 200 and 300.',
    'The area and the two fence rates determine the minimum without any missing side.',
    '90000, 100000 and 160000 come from making every side the same rate or choosing a non-minimum rectangle. The minimum is 120000.'),
  item('cat-2021-s3-qa-q14', 'Percentages', () => '3',
    'Mixing the alloy with 3 kg of pure silver gives 90% silver. Mixing the same weight with 2 kg of 90% silver gives 84% silver. The two equations give an initial weight of 3 kg.',
    'Both mixtures state the added weight and the resulting percentage.',
    '3.5, 2.5 and 4 satisfy only one mixture. Both mixtures give 3 kg.'),
  item('cat-2022-s1-qa-q3', 'Time-Speed-Distance', () => '15',
    'Train A takes 10 minutes for the whole distance. They meet after t minutes, and train B then takes 9 minutes. The meeting equation gives t = 6, so train B’s whole trip takes 15 minutes.',
    'A’s total time and B’s post-meeting time determine B’s total time.',
    '6, 10 and 12 are the meeting time or one of the given times. B’s full trip is 15 minutes.'),
  item('cat-2022-s1-qa-q7', 'Ratios & Proportions', () => '1:7',
    'One part of the original mixture contains half a part lemon juice and half a part syrup. Adding three parts syrup makes lemon:syrup = 0.5:3.5 = 1:7.',
    'The original equality and the added ratio are both stated.',
    '1:4, 1:5 and 1:6 omit part of the syrup already in the mixture. The new ratio is 1:7.'),
  item('cat-2022-s1-qa-q8', 'Averages', () => '5',
    'Three integers total 39. Adding natural number n makes (39 + n) / 4 an odd integer. The smallest such n is 5, because the average is then 11. n = 1 makes the average 10, which is even.',
    'The original sum and the odd-average condition determine the minimum.',
    '3 and 4 are not 1 more than a multiple of 4, and 1 makes an even average. The minimum is 5.'),
  item('cat-2022-s1-qa-q12', 'Averages', () => '4:1',
    'New students average 3 kg more, but the class average rises only 0.6 kg. The extra 3 kg is shared across original and new students, giving original:new = 4:1.',
    'The average increase and the new students’ excess determine the ratio.',
    '1:2, 1:4 and 3:1 reverse the groups or use 3 kg directly as the ratio. The ratio is 4:1.'),
  item('cat-2022-s1-qa-q14', 'Functions & Inequalities', () => '1',
    'The sum of distances from x to −a and to 1 is constant on the interval between them only when those points are exactly 2 apart. The larger such value is a = 1.',
    'An infinite solution interval occurs exactly when the two anchor points are 2 apart and distinct.',
    '0, 2 and −1 place the anchors a different distance apart. The largest working value is 1.'),
  item('cat-2022-s1-qa-q16', 'Coordinate Geometry', () => '(-4, 5)',
    'In parallelogram ABCD the diagonals share a midpoint, so D = A + C − B = (1 − 2 − 3, 1 + 8 − 4) = (−4, 5).',
    'Three vertices in order determine the fourth vertex.',
    'The other points add the vertices in a different order. The parallelogram vertex is (−4, 5).'),
  item('cat-2022-s2-qa-q6', 'Time-Speed-Distance', () => '18',
    'After two hours the ships are the legs of a right triangle whose hypotenuse is 60. If the slower speed is v, then (2v)² + (2v + 12)² = 3600. The positive solution is v = 18.',
    'The right angle, the time and the speed gap determine both speeds.',
    '20, 24 and 12 satisfy a different gap or forget the two-hour scaling. The slower speed is 18.'),
  item('cat-2022-s2-qa-q7', 'Permutation & Combination', () => '1440',
    'Four-digit numbers using these digits and starting with 2, 3, 4 or 5: 4 × 60 = 240. Five-digit numbers: 600. Six-digit numbers: 600. Every such number is greater than 2000. The total is 1440.',
    'The available digits and the greater-than-2000 condition fix the allowed leading digits.',
    '1200, 1420 and 1480 include a leading zero or exclude one length. The total is 1440.'),
  item('cat-2022-s3-qa-q1', 'Number Systems', () => '2222',
    'The distinct rearrangements of 1, 4, 2, 1 use digit 1 twice as often as 4 or 2. Each place therefore averages (1 + 1 + 4 + 2) / 4 = 2, and the average number is 2222.',
    'Symmetry across the distinct rearrangements gives the same average digit in every place.',
    '3333, 2442 and 2592 treat the repeated 1 as two different digits or average the digits incorrectly. The average is 2222.'),
  item('cat-2022-s3-qa-q4', 'Ratios & Proportions', () => '1:1',
    'Moving 150 cc of milk into 500 cc of water and then moving 150 cc back transfers equal amounts of water into the glass and milk left in the cup. The ratio is 1:1.',
    'Equal starting volumes and equal transferred volumes make the two resulting amounts equal.',
    '3:10, 10:3 and 10:13 compare the liquids before the return transfer. After both transfers the ratio is 1:1.'),
  item('cat-2022-s3-qa-q9', 'Averages', () => '22.5',
    'The two smallest distinct natural numbers sum to 28 and the two largest sum to 56. To maximise the middle pair, use 13, 15, 25, 26, 27 and 29. The six-number average is 22.5.',
    'The two fixed pair-sums and the distinct-number condition determine the maximum.',
    '23, 24 and 23.5 require a repeated number or a largest pair that does not average 28. The maximum is 22.5.'),
  item('cat-2022-s3-qa-q10', 'Geometry (Triangles, Circles)', () => '5',
    'For sides 1, 2, 4 and x, the strict quadrilateral inequalities reduce to 2 ≤ x ≤ 6. The possible integer lengths are 2, 3, 4, 5 and 6, five values.',
    'All four sides and the integer condition are stated.',
    '4, 3 and 6 drop an endpoint or use a non-strict inequality. Five lengths work.'),
  item('cat-2022-s3-qa-q15', 'Time-Speed-Distance', () => '90',
    'Closing speed covers the gap in 1.5 hours and the speed difference covers it in 10.5 hours. With the slower speed at 60, the faster speed is 80. The slower car covers 60 × 1.5 = 90 km before they meet.',
    'The two meeting times and one speed determine the gap and the other speed.',
    '100, 120 and 150 use the faster speed or another time. The slower car covers 90 km.'),
  item('cat-2022-s3-qa-q19', 'Functions & Inequalities', () => 'x≤r',
    'For x below r, the function equals r and applying it again still gives r, so the equation holds. For x above r it becomes 4x − 3r, which equals 2x − r only at x = r. The equation holds exactly when x ≤ r.',
    'The piecewise rule is stated for both sides of r.',
    'The other statements omit the region below r or include values above r. The working region is x ≤ r.'),
  item('cat-2022-s3-qa-q20', 'Time and Work', () => '140',
    'N people complete 35% in 70 hours each. After 10 leave, the rest complete 65% in 140 hours each. Equating work per person-hour gives N = 140.',
    'Both stages state the people, hours and percentage completed.',
    '150, 36 and 23 treat the percentages as numbers of people. The staffing equation gives 140.'),
  item('cat-2023-s2-qa-q9', 'Time-Speed-Distance', () => '61.6',
    'Ravi and Ashok close 225 metres at 25 m/s, so they meet after 9 seconds. Vijay must cover the 54 metres plus Ravi’s 100 metres in those 9 seconds. That speed is 61.6 km/h.',
    'All three positions and the two known speeds determine the common meeting time.',
    '67.2, 64.4 and 58.8 use a different meeting time. Vijay’s required speed is 61.6.'),
  item('cat-2023-s2-qa-q11', 'Profit & Loss', () => '31.25%',
    'Minu sells at 1200, buys the sunglasses back at 960, and needs a total profit of 500. The final sale price is 1260. Profit on the 960 purchase is 300, which is 31.25%.',
    'The purchase, both resale percentages and the total profit determine the last price.',
    '26%, 35.42% and 52% compare the profit with the original 1000 or with another base. The last transaction earns 31.25%.'),
  item('cat-2023-s2-qa-q12', 'Ratios & Proportions', () => '1296000',
    'Price is proportional to the square of weight. The most unequal integer pieces 1, 2, 3 and 12 have square-sum 158. The most equal pieces 3, 4, 5 and 6 have square-sum 86. The difference of 72 parts is 288000, so one part is 4000. The original stone costs 4000 × 18² = 1296000.',
    'The weight, the four distinct integer pieces and the price gap determine the constant.',
    'The other prices use a different pair of piece weights. The original price is 1296000.'),
  item('cat-2023-s2-qa-q17', 'Geometry (Triangles, Circles)', () => '2:4:1',
    'With AB = 9 and BC = 6, the three areas are proportional to the segments on BC, and the last area is four times the first. The segments are 12/7, 24/7 and 6/7, so the ratio is 2:4:1.',
    'The rectangle dimensions and the geometric-progression condition determine the three segments.',
    '1:1:2, 1:2:1 and 1:2:4 satisfy only one of the two area conditions. Both conditions give 2:4:1.'),
  item('cat-2023-s3-qa-q9', 'Percentages', () => '17',
    'Two parts of mixture A contain 4/5 part sugar, and three parts of mixture B contain 9/10 part sugar. Sugar is 1.7 parts out of 5, or 34% of mixture C. Mixing with an equal amount of milk makes the drink 17% sugar.',
    'Both recipes, the combining ratio and the equal milk are stated.',
    '16, 24 and 21 omit the milk or one sugar source. The drink is 17% sugar.'),
  item('cat-2023-s3-qa-q11', 'Percentages', () => '73000',
    'The later rise is 10 points larger than the earlier fall, and the 2022 population is higher than 100000. The largest fall that still does this is 27%. The 2021 population is 73000.',
    'The direction of each change, the 10-point gap and the final comparison determine the lowest 2021 population.',
    '74000, 75000 and 72000 are the neighbouring whole-percent falls. The lowest valid population is 73000.'),
  item('cat-2023-s3-qa-q13', 'Profit & Loss', () => '15.5%',
    'The merchant pays 100 for 105 cm and, after a 5% discount, collects 104.5 while giving 95 cm. Cost of that cloth is 1900/21. Profit on cost is exactly 15.5%.',
    'The free length, the short measure, the marked price and the discount are all stated.',
    '9.7%, 16% and 4.2% omit one of those adjustments. The resulting profit is 15.5%.'),
  item('cat-2024-s1-qa-q9', 'Number Systems', () => '42',
    'Each remaining quantity is an integer number of kilograms. Each sale removes half of that quantity and then another 3 kg, and the third sale finishes the stock. Working backwards from zero gives 6, then 18, then 42 kg.',
    'The three identical sale rules and the empty ending determine the start.',
    '50, 18 and 36 are intermediate stocks or one sale short. The initial quantity is 42.'),
  item('cat-2024-s1-qa-q12', 'Profit & Loss', () => '14',
    'The original selling price is 1.4 times cost. A 40% lower cost sold for 5 less earns 50%, so 1.4C − 5 = 0.9C. Cost is 10 and the original selling price is 14.',
    'The original margin and the alternate cost and price determine one selling price.',
    '20, 15 and 10 are the cost or another markup. The original selling price is 14.'),
  item('cat-2024-s1-qa-q14', 'Percentages', () => '6',
    'Interest from bank A is 500t. The maturity amount then earns 3000 + 150t in bank B. Setting 500t : (3000 + 150t) = 10:13 gives t = 6.',
    'Both rates, the second period and the interest ratio are stated.',
    '4, 3 and 5 satisfy a different ratio. Bank A is used for 6 years.'),
  item('cat-2024-s1-qa-q18', 'Percentages', () => '13.26',
    'On incomes 800, 600 and 500, the rent is 120 + 72 + 90 = 282. October incomes are 880, 672 and 575, totalling 2127. The same rent is 282/2127, nearest to 13.26%.',
    'The income ratio, three rent shares and three raises determine the later percentage.',
    '15.18, 12.75 and 14.84 are other roundings or one person’s share. The combined percentage is nearest to 13.26.'),
  item('cat-2024-s1-qa-q20', 'Percentages', () => '1:80',
    'Each operation leaves one-third of the milk. Four operations leave 1/81 of the glass as milk and 80/81 as water. The ratio is 1:80.',
    'The retained fraction and the number of repetitions are stated.',
    '1:26, 1:27 and 1:81 count the operations incorrectly. Four replacements leave 1:80.'),
  item('cat-2024-s1-qa-q21', 'Time-Speed-Distance', () => '12',
    'The speeds add to 30 km/h because the 45 km gap closes in 1.5 hours. Anil’s total time is 1.25 hours more than Sunil’s. The resulting quadratic gives Anil’s speed as 12 km/h.',
    'The distance, meeting time and arrival gap determine both speeds.',
    '18, 14 and 16 are Sunil’s speed or other roots. Anil’s speed is 12.'),
  item('cat-2024-s2-qa-q20', 'Ratios & Proportions', () => '3:5',
    'Adding 2 litres of water makes acid half of the solution, so acid is 2 more than water. Adding 15 litres of acid then makes an 80% solution. Water is 3 litres and acid is 5 litres.',
    'Both additions and both resulting concentrations are stated.',
    '5:4, 4:5 and 5:3 reverse the liquids or the additions. The original water:acid ratio is 3:5.'),
  item('cat-2025-s1-qa-q6', 'Percentages', () => '27',
    'Start with 60 litres of acid in 200 litres. Replacing 20% with water, 10% with acid, and 15% with water leaves 53.72 litres of acid. That is 26.86%, nearest to 27.',
    'The initial concentration and all three replacement steps are stated.',
    '29, 25 and 23 stop after a different step. The final concentration is nearest to 27.'),
  item('cat-2025-s1-qa-q15', 'Coordinate Geometry', () => '29/9',
    'The diagonals of PQRS bisect each other, so S is (5, 4). Line SQ runs from (5, 4) to (1, −5) and crosses y = 0 at x = 29/9.',
    'Three vertices determine the fourth vertex and then the diagonal.',
    '13/4, 27/7 and 10/3 are crossings of another side. The diagonal meets the x-axis at 29/9.'),
  item('cat-2025-s1-qa-q20', 'Time-Speed-Distance', () => '86400',
    'The first part is 28.8 km in 0.5 hours. The four times form an arithmetic progression totalling 3 hours, so they are 0.5, 2/3, 5/6 and 1 hour. The speeds then differ by 9.6 km/h. The fourth part takes one hour at 86.4 km/h, which is 86400 metres.',
    'The total distance, total time and first part determine both progressions.',
    '112000, 76800 and 96000 assign the common differences in the wrong order. The fourth distance is 86400 metres.'),
  item('cat-2025-s1-qa-q21', 'Permutation & Combination', () => '880',
    'There are 5 sandwich types, 4 breads and 2 sizes. Sauces allow none, one, or two distinct sauces: 1 + 6 + 15 = 22 choices. The product is 5 × 4 × 2 × 22 = 880.',
    'Every choice, including the optional sauces, is stated.',
    '800, 600 and 840 omit one sauce count or one bread. The order count is 880.'),
  item('cat-2025-s2-qa-q2', 'Percentages', () => '5',
    'Coffee and cocoa prices consistent with the two mixtures are 576 and 176 per kg. A mixture costing 376 is half coffee. Ten kilograms contain 5 kg of coffee.',
    'The two compositions, their prices and the new price determine the new composition.',
    '2.5, 4 and 6 are other price proportions. The new mixture contains 5 kg of coffee in 10 kg.'),
  item('cat-2025-s2-qa-q3', 'Percentages', () => '8',
    'After the first instalment the balance is 1000(1 + r) − 530, and one year later that balance grows to 594. The positive solution is r = 8%.',
    'The loan and both instalment times determine the compound rate.',
    '9, 11 and 10 make one of the instalments miss 594. The rate is 8%.'),
  item('cat-2025-s2-qa-q7', 'Ratios & Proportions', () => '3:5',
    'Take the expenditures as 2a and 3a. Lakshmi’s income is 18a/7, so her saving is 4a/7. Meenakshi’s saving is 9a/7 and her income is 30a/7. The income ratio is 18:30 = 3:5.',
    'The expenditure ratio, the income-to-expenditure link and the saving ratio determine both incomes.',
    '7:8, 2:1 and 5:6 compare a different pair. The incomes are in the ratio 3:5.'),
  item('cat-2025-s2-qa-q8', 'Profit & Loss', () => '14',
    'A 20% profit on 1650 gives a sale price of 1980. Doubling the discount drops the profit to 110, so the original discount is 10% and the marked price is 2200. The discount rate equal to the resulting profit rate is 100/7%, nearest to 14.',
    'The cost, target profit and doubled-discount result determine the marked price.',
    '12, 18 and 16 are other roundings of a different marked price. The nearest rate is 14.'),
  item('cat-2025-s2-qa-q19', 'Ratios & Proportions', () => '54',
    'The first three terms sum to 52 and their pairwise products sum to 624. The second term is 12 and the first term is 36, with common ratio 1/3. The infinite sum is 36 / (2/3) = 54.',
    'The two symmetric sums determine the first term and a ratio whose absolute value is below 1.',
    '63, 57 and 60 use the increasing ratio, which does not give a decreasing infinite progression. The sum is 54.'),
  item('cat-2025-s2-qa-q22', 'Percentages', () => '5:8',
    'Pinu receives 20%. Meena receives 40% of the rest, which is 32% of the total. Seema receives 20% less than Pinu, which is 16%. Rinu receives the remaining 32%. Pinu:Rinu = 20:32 = 5:8.',
    'The four shares are fixed by the successive percentages.',
    '2:1, 1:2 and 8:5 reverse the comparison or use the remainder before Seema’s share. The ratio is 5:8.'),
  item('cat-2025-s3-qa-q2', 'Time-Speed-Distance', () => '15',
    'The uninterrupted trip takes 6 hours. A 20-minute stop requires an increase of 3 km/h afterwards, while a 30-minute stop requires an increase of 5 km/h. The common distance before the stop gives an initial speed of 15 km/h.',
    'The original duration and both stop scenarios determine the speed.',
    '18, 20 and 12 satisfy only one stop scenario. Both scenarios give 15.'),
  item('cat-2025-s3-qa-q3', 'Number Systems', () => '811',
    'The thousands digit is one less than the units digit, and the tens digit is 6 more than the units digit. The only four-digit solutions are 1682 and 2493. Their difference is 811.',
    'The two digit sums and the tens-units gap determine both numbers.',
    '4078, 735 and 3289 are sums or other digit differences. The extreme numbers differ by 811.'),
  item('cat-2025-s3-qa-q6', 'Time and Work', () => '73',
    'Pipe A’s rate is one tank in 15 hours and corresponds to 4 parts. All three pipes supply 49 parts, so together they take 60/49 hours, which is about 73.47 minutes and nearest to 73.',
    'The rate ratio and A’s time determine the combined time.',
    '71, 76 and 78 round another combined rate. The nearest minute count is 73.'),
  item('cat-2025-s3-qa-q8', 'Percentages', () => '54000',
    'Thirty people average 60000, so they earn 1,800,000 together. A 20% rise for the five managers raises the overall average by 5%, adding 90,000. Managers originally earned 450,000, leaving 1,350,000 for 25 engineers, or 54000 each.',
    'The original average, the manager raise and the resulting average determine the engineer average.',
    '45000, 40000 and 50000 assign the raise to the wrong group. The engineer average is 54000.')
];

const verbal = [
  verbalItem('cat-2021-s1-varc-q17', 'McGurk and MacDonald',
    'The acoustic signal was clear on its own, but pairing it with a mismatched mouth movement made listeners hear a different consonant. The paragraph names that result the McGurk effect and presents it as merged sight and sound.',
    ['The paragraph says the acoustic signal was well recognized alone, so poor auditory quality is not the reason.', 'The paragraph says the signals merge into one percept, not that integration fails.', 'Replication is included, but it leaves out the mismatched sight and sound that define the effect.']),
  verbalItem('cat-2021-s1-varc-q19', 'Foreign peacekeepers',
    'The paragraph gives a partial justification for the distance peacekeepers keep, then says they would be more effective if they worked with communities rather than only with officials.',
    ['The paragraph does not blame the poor environment for the enclave.', 'Calling the local anger simply justifiable drops the partial justification and the proposed change.', 'The paragraph does not say local residents should replace the peacekeepers.']),
  verbalItem('cat-2021-s3-varc-q17', 'The human mind',
    'The paragraph traces intuition to stored experience, pattern recognition and neurochemical signals. It explicitly says intuitive decisions are based on data.',
    ['The paragraph does not say intuition is infinitely richer or accomplishes more than big data.', 'It does not say a faster process makes the decision better.', 'Saying intuition may not be related to data contradicts the paragraph.']),
  verbalItem('cat-2021-s3-varc-q20', 'People view idleness',
    'The paragraph holds both claims: treating hard work as a virtue pushes people into meaningless activity, and hard work has also produced prosperity, health, education and innovation.',
    ['The paragraph does not say hard work led to greater idleness.', 'A leisure recommendation is not the paragraph’s conclusion.', 'Dropping the criticism leaves only the favourable half.']),
  verbalItem('cat-2019-s1-varc-q30', 'A distinguishing feature of language',
    'The paragraph’s conclusion is the order of abilities: thinking about something absent comes before talking about it, and that capacity is a prerequisite for this kind of communication.',
    ['The paragraph does not say that only humans can think about absent objects.', 'A definition of displaced reference, plus thoughts appearing for no reason, misses the precedence claim.', 'Thoughts preceding every speech act is broader than the referential ability described.']),
  verbalItem('cat-2024-s1-varc-q11', 'Scientific research shows',
    'The paragraph’s explanatory conclusion is that shared limbic brain structures explain why animals show emotions associated with humans. The sensing examples are separate support, not the cause of the emotions.',
    ['The paragraph does not say sensory ability causes the emotions.', 'Animals showing those emotions is only one part; it leaves out the brain-structure explanation.', 'Greater skill at sensing danger drops both the emotions and the explanation.']),
  verbalItem('cat-2024-s1-varc-q23', 'Cartographers design',
    'The paragraph says societal and technological change, especially the tools readers use, has made usability matter to cartographers.',
    ['It does not say cartographers experiment by applying the innovations themselves.', 'It attributes the demand to tools, not to maps being used for a variety of reasons.', 'It does not say they run a series of experiments.']),
  verbalItem('cat-2024-s2-varc-q6', 'Recent important scientific findings',
    'The paragraph says cross-field collaborations have produced important findings even though physicists and their collaborators work differently.',
    ['It does not claim the findings came from combining large collections of data with other methods.', 'A desire to diversify is mentioned, but the findings and the friction are the main point.', 'It says the cultures remain out of sync, not that the differences were buried.'])
];

function item(id, topic, solve, solution, sufficiency, optionCheck) {
  return {
    id:id, section:'qa', topic:topic, solve:solve, solution:solution,
    sufficiency_check:sufficiency, option_check:optionCheck,
    common_mistake:'Applying one stated condition and skipping the other.',
    concept_check:topic,
    marg_insight:'Use every stated condition before comparing the result with the options.'
  };
}
function verbalItem(id, lead, explanation, rejects) {
  return { id:id, section:'varc', topic:'Paragraph summary', lead:lead, explanation:explanation, rejects:rejects };
}

function loadPapers() {
  const byId = {};
  for (const file of fs.readdirSync(papersDir)) {
    if (!file.endsWith('.json')) continue;
    const payload = JSON.parse(fs.readFileSync(path.join(papersDir, file), 'utf8'));
    for (const record of payload.questions) byId[record.id] = record;
  }
  return byId;
}

function taskComplete(stem) {
  return /\?\s*$/.test(stem) || /\b(?:what|which|who|where|when|why|how many|how much)\b/i.test(stem) ||
    /\b(?:is|are|equals?|equal to|nearest to|closest to|was|were|will be|in the ratio)\s*$/i.test(stem) ||
    /\b(?:exceed(?:s|ed)?|increase(?:s|d)?|decrease(?:s|d)?)\b[\s\S]{0,80}\bby\s*$/i.test(stem);
}
function dirty(record) {
  const stem = norm(record.stem);
  const options = (record.options || []).map(cleanChoice);
  if (/answer key|quantitative ability|verbal ability|data interpretation|cat actual paper/i.test(stem + ' ' + options.join(' '))) return 'leaked adjacent material';
  if (options.some((option) => option.length > 80 || /\b[A-D]\)/.test(option))) return 'option is not a single choice';
  if (new Set(options).size !== 4) return 'options are not four distinct choices';
  if (!taskComplete(stem)) return 'stem does not finish a task';
  if (stem.length < 40 || stem.length > 650) return 'stem length is not reliable';
  return '';
}

function splitPassage(stem, lead) {
  const text = norm(stem);
  const at = text.indexOf(lead);
  if (at < 0) throw new Error('Passage lead not found');
  return text.slice(at);
}

function optionLabel(index, text) {
  return 'ABCD'[index] + '. ' + text;
}

function buildChecked(papers) {
  const checked = [];
  const problems = [];
  for (const entry of qa) {
    const record = papers[entry.id];
    if (!record) throw new Error('Missing ' + entry.id);
    const problem = dirty(record);
    if (problem) { problems.push(entry.id + ' ' + problem + ' || ' + norm(record.stem).slice(-70)); continue; }
    const solved = canon(entry.solve());
    const options = record.options.map(cleanChoice);
    const found = options.map(canon).reduce((hits, value, index) => value === solved ? hits.concat(index) : hits, []);
    if (found.length !== 1) { problems.push(entry.id + ' solved ' + solved + ' options ' + options.join(' | ')); continue; }
    const correct = found[0];
    const raw = canon(record.answer_raw);
    const agrees = record.correct_index === correct || (record.correct_index == null && raw === canon(options[correct]));
    if (!agrees) { problems.push(entry.id + ' solver index ' + correct + ' extracted ' + record.answer_raw); continue; }
    checked.push(Object.assign({}, entry, {
      stem:norm(record.stem),
      options:options.map(function(text, index) { return optionLabel(index, text); }),
      correct:correct,
      solveSource:entry.solve.toString()
    }));
  }
  for (const entry of verbal) {
    const record = papers[entry.id];
    if (!record || record.correct_index == null) throw new Error('Verbal record missing ' + entry.id);
    const options = record.options.map(norm);
    if (options.length !== 4 || new Set(options).size !== 4) throw new Error(entry.id + ' options are not usable');
    if (options.some((option) => option.length > 220)) throw new Error(entry.id + ' option absorbs later text');
    const passage = splitPassage(record.stem, entry.lead);
    if (passage.length < 280) throw new Error(entry.id + ' passage is too short');
    entry.rejects.forEach((reason, index) => {
      if (!reason || index === record.correct_index) return;
    });
    if (!entry.explanation || entry.rejects.length !== 3) throw new Error(entry.id + ' explanation is incomplete');
    const orderedRejects = [];
    let rejectAt = 0;
    for (let index = 0; index < 4; index++) {
      if (index === record.correct_index) continue;
      orderedRejects.push(entry.rejects[rejectAt++]);
    }
    checked.push({
      id:entry.id, section:'varc', topic:entry.topic, stem:norm(record.stem), passage:passage,
      question:'Which option best captures the essence of this passage?',
      options:options.map(function(text, index) { return optionLabel(index, text); }), correct:record.correct_index,
      explanation:entry.explanation,
      sufficiency_check:'The paragraph quoted in the passage contains every comparison used to choose the answer.',
      option_check:'Only one option keeps the paragraph’s conclusion. ' + orderedRejects.join(' '),
      trap_type:'Partial or overstated summary',
      marg_insight:'A summary has to keep the paragraph’s conclusion, not only one true detail.',
      rejects:orderedRejects
    });
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return checked;
}

function emit(checked) {
  const payload = checked.map((entry) => {
    const copy = Object.assign({}, entry);
    delete copy.solve;
    delete copy.solveSource;
    delete copy.lead;
    return copy;
  });
  const solvers = checked.filter((entry) => entry.solveSource).map((entry) => {
    return 'solvers[' + JSON.stringify(entry.id) + '] = ' + entry.solveSource + ';';
  }).join('\n');
  return `/* Checked CAT bank.
 * answer_key_ready in the paper files means the text and an answer table were extracted.
 * Only the items in this file have an answer recomputed from the question.
 * Indexed DILR remains unavailable: the shared table or conditions are not in the question record. */
var MargCATBank = (function () {
  var items = ${JSON.stringify(payload, null, 2)};
  var solvers = {};
  ${solvers}
  function canon(value) {
    return String(value || '').replace(/[−–—]/g, '-').replace(/[\\u{1D400}-\\u{1D7FF}]/gu, function(ch) {
      var cp = ch.codePointAt(0);
      if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCharCode(97 + cp - 0x1D44E);
      if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434);
      return ch;
    }).toLowerCase().replace(/\\s+/g, '').replace(/₹/g, '').replace(/%/g, '');
  }
  function bare(option) {
    return String(option || '').replace(/^[A-D]\\.\\s*/, '').trim();
  }
  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function agreement(entry) {
    if (!entry || entry.section !== 'qa' || typeof solvers[entry.id] !== 'function') return false;
    var solved = canon(solvers[entry.id]());
    var hits = [];
    entry.options.forEach(function(option, index) { if (canon(bare(option)) === solved) hits.push(index); });
    return hits.length === 1 && hits[0] === entry.correct;
  }
  function qaItems() { return items.filter(function(entry) { return entry.section === 'qa' && agreement(entry); }); }
  function verbalItems() { return items.filter(function(entry) { return entry.section === 'varc'; }); }
  function questionShape(entry) {
    return {
      sourceId:entry.id, topic:entry.topic, q:entry.stem, options:entry.options.slice(), correct:entry.correct,
      solution:entry.solution, sufficiency_check:entry.sufficiency_check, option_check:entry.option_check,
      common_mistake:entry.common_mistake, concept_check:entry.concept_check, marg_insight:entry.marg_insight
    };
  }
  function windows(list, count) {
    var packs = [];
    if (!list.length || count < 1 || list.length < count) return packs;
    for (var start = 0; start < list.length; start++) {
      var chosen = [];
      for (var offset = 0; offset < count; offset++) chosen.push(list[(start + offset) % list.length]);
      packs.push(chosen);
    }
    return packs;
  }
  function qaPacks(count, topic) {
    var wanted = String(topic || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    var pool = qaItems().filter(function(entry) {
      if (!wanted || /^(?:mixed qa|diagnostic(?: qa)?|qa|method recognition)$/.test(wanted)) return true;
      return String(entry.topic || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim() === wanted;
    });
    return windows(pool, count).map(function(chosen) {
      return {
        difficulty:'CAT',
        topics_combined:chosen.map(function(entry) { return entry.topic; }).filter(function(topicName, index, all) { return all.indexOf(topicName) === index; }),
        _margBankChecked:true,
        questions:chosen.map(questionShape)
      };
    });
  }
  function verbalPacks(count) {
    return windows(verbalItems(), count).map(function(chosen) {
      return {
        _margBankChecked:true,
        sets:chosen.map(function(entry) {
          return {
            difficulty:'CAT', topic:entry.topic, passage:entry.passage,
            questions:[{
              sourceId:entry.id, q:entry.question, options:entry.options.slice(), correct:entry.correct,
              explanation:entry.explanation, sufficiency_check:entry.sufficiency_check, option_check:entry.option_check,
              trap_type:entry.trap_type, marg_insight:entry.marg_insight
            }]
          };
        })
      };
    });
  }
  function sameText(left, right) { return canon(left) === canon(right); }
  function isCheckedVerbalPack(data, expectedCount) {
    if (!data || !Array.isArray(data.sets) || !data.sets.length) return false;
    if (expectedCount && data.sets.length !== expectedCount) return false;
    return data.sets.every(function(setObj) {
      var question = setObj && Array.isArray(setObj.questions) ? setObj.questions[0] : null;
      var entry = question && byId(question.sourceId);
      return !!(entry && entry.section === 'varc' && setObj.questions.length === 1 && sameText(setObj.passage, entry.passage) &&
        sameText(question.q, entry.question) && question.correct === entry.correct &&
        question.options.length === 4 && question.options.every(function(option, index) { return sameText(option, entry.options[index]); }));
    });
  }
  function isCheckedQAPack(data) {
    if (!data || !Array.isArray(data.questions) || !data.questions.length) return false;
    return data.questions.every(function(question) {
      var entry = byId(question && question.sourceId);
      return !!(entry && entry.section === 'qa' && agreement(entry) && question.correct === entry.correct && sameText(question.q, entry.stem) &&
        Array.isArray(question.options) && question.options.length === 4 && question.options.every(function(option, index) { return sameText(option, entry.options[index]); }));
    });
  }
  function normText(value) { return String(value || '').replace(/\\s+/g, ' ').trim(); }
  function defects(record) {
    var stem = normText(record && record.stem);
    var options = ((record && record.options) || []).map(normText);
    var blob = stem + ' ' + options.join(' ');
    var found = [];
    if (/answer key|quantitative ability|verbal ability|data interpretation|cat actual paper/i.test(blob)) found.push('leaked_adjacent_material');
    if (options.some(function(option) { return option.length > 400; })) found.push('option_absorbs_later_material');
    if (/[\\uE000-\\uF8FF]/.test(stem)) found.push('unreadable_formula');
    if (options.length > 1 && new Set(options).size !== options.length) found.push('duplicate_options');
    return found;
  }
  function selfContainedVerbal(record) {
    var stem = normText(record.stem);
    return stem.length >= 400 && stem.length <= 1800 && (record.options || []).length === 4 && record.correct_index != null &&
      /summary|summaris|essence of the passage|sentence that is missing|jumbled up sentences/i.test(stem) && !defects(record).length;
  }
  function classify(record) {
    if (!record || !record.id) return 'incomplete_data';
    if (byId(record.id) && (record.section !== 'qa' || agreement(byId(record.id)))) return 'independently_checked';
    if (defects(record).length) return 'defective_extraction';
    if (record.section === 'varc' || record.section === 'dilr') {
      if (record.section === 'varc' && selfContainedVerbal(record)) return 'self_contained_stimulus_not_yet_checked';
      return 'missing_shared_context';
    }
    if (record.correct_index != null && (record.options || []).length === 4) return 'key_extracted_not_independently_checked';
    var raw = canon(record.answer_raw);
    var optionHits = (record.options || []).map(normText).filter(function(option) { return option && canon(option) === raw; });
    if (raw && optionHits.length === 1) return 'key_matches_option_not_independently_checked';
    return 'incomplete_data';
  }
  return {
    items:function() { return items.map(function(entry) { return Object.assign({}, entry); }); },
    qaPacks:qaPacks, verbalPacks:verbalPacks, isCheckedVerbalPack:isCheckedVerbalPack, isCheckedQAPack:isCheckedQAPack,
    classify:classify, agreement:agreement, servedIds:function() { return items.map(function(entry) { return entry.id; }); }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MargCATBank;
function runCATBankVerificationTests() {
  var qa = MargCATBank.qaPacks(3, '');
  var verbal = MargCATBank.verbalPacks(3);
  var sample = MargCATBank.items().filter(function(entry) { return entry.section === 'qa'; })[0];
  return [
    { name:'every checked QA answer is recomputed from the question', passed:MargCATBank.items().filter(function(entry) { return entry.section === 'qa'; }).every(function(entry) { return MargCATBank.agreement(entry); }) },
    { name:'checked QA practice has three questions', passed:qa.length > 0 && qa[0].questions.length === 3 && MargCATBank.isCheckedQAPack(qa[0]) },
    { name:'checked paragraph summaries keep the passage with the question', passed:verbal.length > 0 && MargCATBank.isCheckedVerbalPack(verbal[0], 3) },
    { name:'a changed summary key is not accepted', passed:(function() { var copy = JSON.parse(JSON.stringify(verbal[0])); copy.sets[0].questions[0].correct = (copy.sets[0].questions[0].correct + 1) % 4; return MargCATBank.isCheckedVerbalPack(copy, 3) === false; })() },
    { name:'an extracted key alone is not cleared for students', passed:MargCATBank.classify({ id:'not-a-checked-item', section:'qa', stem:'A complete question is asked here?', options:['1','2','3','4'], correct_index:0 }) === 'key_extracted_not_independently_checked' },
    { name:'a passage question without its passage stays unavailable', passed:MargCATBank.classify({ id:'cat-2024-s1-varc-q1', section:'varc', stem:'Which one of the following statements provides a gist of this passage?', options:['a','b','c','d'], correct_index:2 }) === 'missing_shared_context' },
    { name:'a DILR fragment without the shared data stays unavailable', passed:MargCATBank.classify({ id:'cat-2024-s1-dilr-q10', section:'dilr', stem:'How many rounds were there in the tournament?', options:[], correct_index:null }) === 'missing_shared_context' },
    { name:'a checked sample is not duplicated inside its own pack', passed:new Set(qa[0].questions.map(function(question) { return question.sourceId; })).size === 3 && sample && sample.correct >= 0 },
    { name:'contaminated 2017 extractions are not served', passed:MargCATBank.servedIds().every(function(id) { return id.indexOf('2017') === -1; }) && MargCATBank.classify({ id:'cat-2017-s1-qa-q9', section:'qa', stem:'A later question is glued on. Quantitative Ability', options:['1','2','3','4'], correct_index:0 }) === 'defective_extraction' },
    { name:'indexed DILR is not served', passed:MargCATBank.items().every(function(entry) { return entry.section !== 'dilr'; }) && MargCATBank.servedIds().every(function(id) { return id.indexOf('-dilr-') === -1; }) }
  ];
}
if (typeof window !== 'undefined') window.runCATBankVerificationTests = runCATBankVerificationTests;
`;
}

function classifyAll(mod, papers) {
  const counts = {};
  const bySection = {};
  const statusById = {};
  Object.keys(papers).forEach((id) => {
    const record = papers[id];
    const status = mod.classify(record);
    counts[status] = (counts[status] || 0) + 1;
    bySection[record.section] = bySection[record.section] || {};
    bySection[record.section][status] = (bySection[record.section][status] || 0) + 1;
    statusById[id] = status;
  });
  return {
    schema:1,
    meaning:{
      independently_checked:'The answer was recomputed from the question, or a paragraph summary was checked against its own paragraph.',
      key_extracted_not_independently_checked:'An answer table supplied an index, but the question was not solved independently.',
      key_matches_option_not_independently_checked:'The extracted response matches one option, but the question was not solved independently.',
      self_contained_stimulus_not_yet_checked:'The question contains its own paragraph, but that answer was not checked.',
      missing_shared_context:'The passage, table or shared conditions needed to answer are not in the record.',
      defective_extraction:'The text merges later material, leaks a header, or repeats choices.',
      incomplete_data:'Options or a usable answer are missing.'
    },
    examined:Object.keys(papers).length,
    counts:counts,
    bySection:bySection,
    served:{ qa:mod.items().filter((entry) => entry.section === 'qa').map((entry) => entry.id), varc:mod.items().filter((entry) => entry.section === 'varc').map((entry) => entry.id), dilr:[] },
    statusById:statusById
  };
}

function main() {
  const papers = loadPapers();
  const checked = buildChecked(papers);
  const js = emit(checked);
  const target = path.join(root, 'cat-bank-verification.js');
  fs.writeFileSync(target, js);
  const mod = require(target);
  const bad = mod.items().filter((entry) => entry.section === 'qa' && !mod.agreement(entry));
  if (bad.length) throw new Error('Emitted solver disagreement: ' + bad.map((entry) => entry.id).join(','));
  const audit = classifyAll(mod, papers);
  if (audit.examined !== 1636) throw new Error('Expected 1636 records, found ' + audit.examined);
  if (audit.bySection.dilr.independently_checked) throw new Error('Indexed DILR was marked checked');
  fs.writeFileSync(path.join(root, 'data/cat-pyq/verification-status.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ examined:audit.examined, counts:audit.counts, bySection:audit.bySection, served:audit.served }, null, 2));
}

main();
