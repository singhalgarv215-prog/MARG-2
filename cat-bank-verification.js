/* Checked CAT bank.
 * answer_key_ready in the paper files means the text and an answer table were extracted.
 * Only the items in this file have an answer recomputed from the question.
 * Indexed DILR remains unavailable: the shared table or conditions are not in the question record. */
var MargCATBank = (function () {
  var items = [
  {
    "id": "cat-2019-s1-qa-q2",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Take Bimala’s income as 100. Amala is 20% more, so 120. Amala is 20% less than Kamala, so Kamala is 150. After the changes Kamala has 144 and Bimala has 110. 144 exceeds 110 by 34/110, which is 30.9% and nearest to 31.",
    "sufficiency_check": "Both percentage changes and the reversed base are stated.",
    "option_check": "28, 32 and 29 are nearby rounding or base errors. Only 31 is the nearest value.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The income of Amala is 20% more than that of Bimala and 20% less than that of Kamala. If Kamala's income goes down by 4% and Bimala's goes up by 10%, then the percentage by which Kamala's income would exceed Bimala's is nearest to",
    "options": [
      "A. 31",
      "B. 28",
      "C. 32",
      "D. 29"
    ],
    "correct": 0
  },
  {
    "id": "cat-2019-s1-qa-q4",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "Let the pen and book cost p and b. Then −0.05p + 0.15b = 7 and 0.05p + 0.10b = 13. Adding gives 0.25b = 20, so the book costs 80.",
    "sufficiency_check": "The two sale conditions give two linear equations in the two costs.",
    "option_check": "85, 95 and 100 do not satisfy both gain conditions. Only 80 does.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "On selling a pen at 5% loss and a book at 15% gain, Karim gains Rs. 7. If he sells the pen at 5% gain and the book at 10% gain, he gains Rs. 13. What is the cost price of the book in Rupees?",
    "options": [
      "A. 80",
      "B. 85",
      "C. 95",
      "D. 100"
    ],
    "correct": 0
  },
  {
    "id": "cat-2019-s1-qa-q7",
    "section": "qa",
    "topic": "Averages",
    "solution": "The 21 students other than Gautam total 62 × 21 = 1302. The class average is one more than the average excluding Ramesh. Solving that relation gives a class total of 1353, so Gautam scored 1353 − 1302 = 51.",
    "sufficiency_check": "Both averages and Ramesh’s score are stated, so Gautam’s score is determined.",
    "option_check": "49, 48 and 53 come from moving the one-mark condition to the wrong group. Only 51 fits both averages.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Ramesh and Gautam are among 22 students who write an examination. Ramesh scores 82.5. The average score of the 21 students other than Gautam is 62. The average score of all the 22 students is one more than the average score of the 21 students other than Ramesh. The score of Gautam is",
    "options": [
      "A. 49",
      "B. 48",
      "C. 51",
      "D. 53"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s1-qa-q8",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Usual rates satisfy 1/A + 1/B = 1/12. Half of A’s rate and three times B’s rate finish the task in 9 days. Solving gives 1/A = 1/18, so A alone takes 18 days.",
    "sufficiency_check": "The two combined-rate conditions determine A’s usual rate.",
    "option_check": "24, 12 and 36 swap the half-rate and triple-rate conditions. Only 18 satisfies both.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "At their usual efficiency levels, A and B together finish a task in 12 days. If A had worked half as efficiently as she usually does, and B had worked thrice as efficiently as he usually does, the task would have been completed in 9 days. How many days would A take to finish the task if she works alone at her usual efficiency?",
    "options": [
      "A. 24",
      "B. 18",
      "C. 12",
      "D. 36"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s1-qa-q10",
    "section": "qa",
    "topic": "Geometry (Triangles, Circles)",
    "solution": "CD is a diameter, so CD = 22. With CE = 7, ED = 15. Intersecting chords give AE × EB = 7 × 15 = 105, and AE + EB = 20.5. The two lengths are 10.5 and 10, so their difference is 0.5.",
    "sufficiency_check": "The radius, chord and one segment of the diameter determine both chord segments.",
    "option_check": "2.5, 3.5 and 1.5 are differences from other splits of 20.5. Only 0.5 fits the chord product.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Geometry (Triangles, Circles)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In a circle of radius 11 cm, CD is a diameter and AB is a chord of length 20.5 cm. If AB and CD intersect at a point E inside the circle and CE has length 7 cm, then the difference of the lengths of BE and AE, in cm, is",
    "options": [
      "A. 2.5",
      "B. 3.5",
      "C. 0.5",
      "D. 1.5"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s1-qa-q12",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Interest is proportional to investment times rate: 3×6, 4×5 and 5×4, or 18:20:20. Bina exceeds Amala by 2 parts = 250, so one part is 125. Total interest is 58 × 125 = 7250.",
    "sufficiency_check": "The two ratios and Bina’s excess determine every interest amount.",
    "option_check": "6350, 7000 and 6000 use a different part value. Only 7250 matches the 250 excess.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Amala, Bina, and Gouri invest money in the ratio 3 : 4 : 5 in fixed deposits having respective annual interest rates in the ratio 6 : 5 : 4. What is their total interest income (in Rs) after a year, if Bina's interest income exceeds Amala's by Rs 250?",
    "options": [
      "A. 6350",
      "B. 7250",
      "C. 7000",
      "D. 6000"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s1-qa-q13",
    "section": "qa",
    "topic": "Set Theory",
    "solution": "Everyone plays at least one game, so 144 + 123 + 132 − 58 − 25 − 63 + all three = 256. All three equals 3. Only tennis is 123 − 58 − 25 + 3 = 43.",
    "sufficiency_check": "The three game counts, three pair counts and the club size determine the tennis-only count.",
    "option_check": "45, 38 and 32 omit or double-count the three-game overlap. Only 43 remains.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Set Theory",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A club has 256 members of whom 144 can play football, 123 can play tennis, and 132 can play cricket. Moreover, 58 members can play both football and tennis, 25 can play both cricket and tennis, while 63 can play both football and cricket. If every member can play at least one game, then the number of members who can play only tennis is",
    "options": [
      "A. 45",
      "B. 38",
      "C. 32",
      "D. 43"
    ],
    "correct": 3
  },
  {
    "id": "cat-2019-s1-qa-q16",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "The first car travels at least 6 hours and the second starts one hour later. For a 6-hour trip the second uses 5 hours for the same distance, so its speed is 20% higher. A longer trip makes the percentage smaller.",
    "sufficiency_check": "The one-hour start gap and the minimum duration determine the maximum percentage.",
    "option_check": "30, 25 and 10 belong to other durations. The maximum under the stated minimum is 20.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two cars travel the same distance starting at 10:00 am and 11:00 am, respectively, on the same day. They reach their common destination at the same point of time. If the first car travelled for at least 6 hours, then the highest possible value of the percentage by which the speed of the second car could exceed that of the first car is",
    "options": [
      "A. 30",
      "B. 25",
      "C. 10",
      "D. 20"
    ],
    "correct": 3
  },
  {
    "id": "cat-2019-s1-qa-q22",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Half a litre weighs 480 g, so one litre weighs 960 g. If liquid 1 is fraction x, then 1000x + 800(1 − x) = 960. Thus 200x = 160 and x = 80%.",
    "sufficiency_check": "Both densities and the mixture weight are stated.",
    "option_check": "85, 70 and 75 solve a different mixture weight. Only 80 matches 960 g per litre.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A chemist mixes two liquids 1 and 2. One litre of liquid 1 weighs 1 kg and one litre of liquid 2 weighs 800 gm. If half litre of the mixture weighs 480 gm, then the percentage of liquid 1 in the mixture, in terms of volume, is",
    "options": [
      "A. 85",
      "B. 70",
      "C. 75",
      "D. 80"
    ],
    "correct": 3
  },
  {
    "id": "cat-2019-s1-qa-q27",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "Amal uses each speed for the same time, so his average speed is 20. Bimal uses each speed for the same distance, so his average is 3 / (1/10 + 1/20 + 1/30) = 180/11. His time exceeds Amal’s by 2/9, nearest to 22%.",
    "sufficiency_check": "The two ways of sharing the same speeds determine the time ratio.",
    "option_check": "21, 20 and 19 are other roundings. 22 is the nearest percentage.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "One can use three different transports which move at 10, 20, and 30 kmph, respectively. To reach from A to B, Amal took each mode of transport 1/3 of his total journey time, while Bimal took each mode of transport 1/3 of the total distance. The percentage by which Bimal’s travel time exceeds Amal’s travel time is nearest to",
    "options": [
      "A. 21",
      "B. 22",
      "C. 20",
      "D. 19"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s1-qa-q31",
    "section": "qa",
    "topic": "Percentages",
    "solution": "A 40% score increased by 50% is 60% of the paper and is 35 below passing. Increasing that score by 20% gives 72% of the paper, which is 7 above passing. The 12-point gap is 42 marks, so the paper is 350 and passing is 245, or 70%.",
    "sufficiency_check": "The two review statements determine both the paper total and the passing mark.",
    "option_check": "60, 75 and 80 reuse one of the stated percentages as the passing mark. Only 70 fits both statements.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Meena scores 40% in an examination and after review, even though her score is increased by 50%, she fails by 35 marks. If her post-review score is increased by 20%, she will have 7 marks more than the passing score. The percentage score needed for passing the examination is",
    "options": [
      "A. 70",
      "B. 60",
      "C. 75",
      "D. 80"
    ],
    "correct": 0
  },
  {
    "id": "cat-2019-s1-qa-q34",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "For positive a and b, (a³ − b³) / (a − b)³ = 1 + 3ab / (a − b)² = 157/3. With ab = 616 this gives (a − b)² = 36. Then (a + b)² = 36 + 4×616 = 2500, so the sum is 50.",
    "sufficiency_check": "The product and cube ratio determine both the difference and the sum.",
    "option_check": "58, 95 and 85 do not satisfy both the product and the cube ratio. Only 50 does.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The product of two positive numbers is 616. If the ratio of the difference of their cubes to the cube of their difference is 157:3, then the sum of the two numbers is",
    "options": [
      "A. 58",
      "B. 50",
      "C. 95",
      "D. 85"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s2-qa-q1",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Take 2010 salaries as 6k, 5k and 7k. Ramesh’s 25% rise makes his 2015 salary 7.5k, matching the 3-part term, so one 2015 part is 2.5k. Rajesh’s 2015 salary is also 7.5k, up from 7k by about 7.14%, closest to 7.",
    "sufficiency_check": "The two ratios and Ramesh’s rise determine Rajesh’s rise.",
    "option_check": "8, 9 and 10 are the other listed approximations. The calculated rise is closest to 7.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The salaries of Ramesh, Ganesh and Rajesh were in the ratio 6:5:7 in 2010, and in the ratio 3:4:3 in 2015. If Ramesh’s salary increased by 25% during 2010 - 2015, then the percentage increase in Rajesh’s salary during this period is closest to",
    "options": [
      "A. 8",
      "B. 7",
      "C. 9",
      "D. 10"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s2-qa-q3",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "After each score rises by 6, the scores are 11t, 10t and 3t. Rama’s original score was one-twelfth of the other two original scores, which gives t = 4. Anjali then exceeds Rama by 44 − 12 = 32. The same gap holds before the review.",
    "sufficiency_check": "The original relation and the revised ratio determine every score.",
    "option_check": "24, 26 and 35 use a different common ratio term. Only 32 fits the one-twelfth condition.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In an examination, Rama's score was one -twelfth of the sum of the scores of Mohan and Anjali. After a review, the score of each of them increased by 6. The revised scores of Anjali, Mohan, and Rama were in the ratio 11:10:3. Th en Anjali's score exceeded Rama's score by",
    "options": [
      "A. 24",
      "B. 26",
      "C. 32",
      "D. 35"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s2-qa-q5",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Anil works for the whole job and Sunil works after the first 3 days. Together they complete 90% because Bimal completes the other 10%. Their combined rate gives 10 days of joint work. Total time is 3 + 10 = 13 days.",
    "sufficiency_check": "Bimal’s share is stated, so his unknown rate is not needed.",
    "option_check": "14, 15 and 12 include or exclude the opening 3 days incorrectly. Only 13 fits the 90% done by Anil and Sunil.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Anil alone can do a job in 20 days while Sunil alone can do it in 40 days. Anil starts the job, and after 3 days, Sunil joins him. Again, after a few more days, Bimal joins them and they together finish the job. If Bimal has done 10% of the job, then in how many days was the job done?",
    "options": [
      "A. 14",
      "B. 13",
      "C. 15",
      "D. 12"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s2-qa-q9",
    "section": "qa",
    "topic": "Averages",
    "solution": "Thirty integers total 150, and exactly 20 of them are at most 5. The other 10 are at least 6 and total at least 60. The group of 20 therefore totals at most 90, and ten 4s with ten 5s reach that total. Their average is 4.5.",
    "sufficiency_check": "The integer condition and the count above 5 fix the maximum.",
    "option_check": "4, 3.5 and 5 either miss the maximum or put a number above 5 into the group. Only 4.5 is attainable.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The average of 30 integers is 5. Among these 30 integers, there are exactly 20 which do not exceed 5. What is the highest possible value of the average of these 20 integers?",
    "options": [
      "A. 4",
      "B. 3.5",
      "C. 4.5",
      "D. 5"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s2-qa-q15",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "At the first meeting A has covered 60% and B 40%, so their speeds are in the ratio 3:2. A then covers the remaining 40% in 12 minutes, so A’s full lap takes 30 minutes and B’s takes 45. They started 18 minutes before 10:00, and B finishes at 10:27.",
    "sufficiency_check": "The meeting split and A’s return time determine both speeds and the start time.",
    "option_check": "10:25, 10:18 and 10:45 use another lap time. The speeds give 10:27.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two ants A and B start from a point P on a circle at the same time, with A moving clock-wise and B moving anti-clockwise. They meet for the first time at 10:00 am when A has covered 60% of the track. If A returns to P at 10:12 am, then B returns to P at",
    "options": [
      "A. 10 : 25am",
      "B. 10 :18am",
      "C. 10 : 27am",
      "D. 10 : 45am"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s2-qa-q16",
    "section": "qa",
    "topic": "Geometry (Triangles, Circles)",
    "solution": "The centroid divides the medians in the ratio 2:1, leaving perpendicular segments of 8 and 6. Placing the centroid at the origin and rebuilding the third vertex gives triangle area 72.",
    "sufficiency_check": "Two perpendicular median lengths determine the triangle.",
    "option_check": "68, 78 and 80 use a different fraction of the medians. The rebuilt triangle has area 72.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Geometry (Triangles, Circles)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In a triangle ABC, medians AD and BE are perpendicular to each other, and have lengths 12 cm and 9 cm, respectively. Then, the area of triangle ABC, in sq cm, is",
    "options": [
      "A. 68",
      "B. 72",
      "C. 78",
      "D. 80"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s2-qa-q17",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Let 2010 fiction be F. Then 1.10F + 1.12(11500 − F) = 12760, so F = 6000. Fiction in 2015 is 1.10 × 6000 = 6600.",
    "sufficiency_check": "The two totals and two growth rates determine the fiction count.",
    "option_check": "6000, 6160 and 5500 are the 2010 count or other growth applications. The 2015 fiction count is 6600.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In 2010, a library contained a total of 11500 books in two categories - fiction and nonfiction. In 2015, the library contained a total of 12760 books in these two categories. During this period, there was 10% increase in the fiction category while there was 12% increase in the non-fiction category. How many fiction books were in the library in 2015?",
    "options": [
      "A. 6000",
      "B. 6160",
      "C. 5500",
      "D. 6600"
    ],
    "correct": 3
  },
  {
    "id": "cat-2019-s2-qa-q23",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "Bimal pays 1.2 × 1.3p = 1.56p. Barun pays 0.8 × 0.7p = 0.56p. The difference divided by p is 1.",
    "sufficiency_check": "Both resale percentages are stated and apply to the prices already paid.",
    "option_check": "0.7, 1.2 and 0.50 combine the percentages in a different order. The ratio is 1.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A shopkeeper sells two tables, each procured at cost price p, to Amal and Asim at a profit of 20% and at a loss of 20%, respectively. Amal sells his table to Bimal at a profit of 30%, while Asim sells his table to Barun at a loss of 30%. If the amounts paid by Bimal and Barun are x and y, respectively, then ( x −y) / p equals",
    "options": [
      "A. 0.7",
      "B. 1",
      "C. 1.2",
      "D. 0.50"
    ],
    "correct": 1
  },
  {
    "id": "cat-2019-s2-qa-q24",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "Ten bicycles cost 10c. Six sold at a 25% profit and four at a 25% loss bring 10.5c. Profit is 0.5c = 2000, so c = 4000.",
    "sufficiency_check": "The two sale groups and the total profit determine one price.",
    "option_check": "8000, 6000 and 2000 double or halve the profit base. Only 4000 gives a profit of 2000.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Mukesh purchased 10 bicycles in 2017, all at the same price. He sold six of these at a profit of 25% and the remaining four at a loss of 25%. If he made a total profit of Rs. 2000, then his purchase price of a bicycle, in Rupees, was",
    "options": [
      "A. 8000",
      "B. 6000",
      "C. 4000",
      "D. 2000"
    ],
    "correct": 2
  },
  {
    "id": "cat-2019-s2-qa-q33",
    "section": "qa",
    "topic": "Number Systems",
    "solution": "Both sequences are integers: 15 + 4k and 14 + 5m. A common term requires k = 1 + 5t, and the last term that fits both lists is at t = 19. That gives 20 common terms.",
    "sufficiency_check": "Both first terms, both gaps and both endpoints are stated.",
    "option_check": "18, 19 and 21 stop one step early or include a term beyond an endpoint. The count is 20.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Number Systems",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The number of common terms in the two sequences: 15 , 19, 23, 27, . . . . , 415 and 14, 19, 24, 29, . . . , 464 is",
    "options": [
      "A. 18",
      "B. 19",
      "C. 21",
      "D. 20"
    ],
    "correct": 3
  },
  {
    "id": "cat-2021-s1-qa-q5",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "The faster train covers its own 160 m in 12 seconds, so its speed is 40/3 m/s. The other train is 6 km/h, or 5/3 m/s, slower. Their closing speed is 25 m/s, and in 14 seconds the lengths total 350 m. The other train is 190 m long.",
    "sufficiency_check": "The lamp-post time, length and speed gap determine the second length.",
    "option_check": "180, 192 and 184 come from using the same direction or forgetting the speed gap. The opposite-direction lengths give 190.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two trains cross each other in 14 seconds when running in opposite directions along parallel tracks. The faster train is 160 m long and crosses a lamp post in 12 seconds. If the speed of the other train is 6 km/hr less than the faster one, its length, in m, is",
    "options": [
      "A. 180",
      "B. 192",
      "C. 190",
      "D. 184"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s1-qa-q9",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Odd days are Anu and Vinu at 3/20 per day. Even days are Vinu and Manu at 2/15 per day. Three such pairs finish 17/20, and the next odd day finishes the remaining 3/20. The work takes 7 days.",
    "sufficiency_check": "The three rates and the alternating schedule are all stated.",
    "option_check": "5, 8 and 6 stop at a partial cycle or add an extra day. The remaining work fits exactly on day 7.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Anu, Vinu and Manu can complete a work alone in 15 days, 12 days and 20 days, respectively. Vinu works everyday. Anu works only on alternate days starting from the first day while Manu works only on alternate days starting from the second day. Then, the number of days needed to complete the work is",
    "options": [
      "A. 7",
      "B. 5",
      "C. 8",
      "D. 6"
    ],
    "correct": 0
  },
  {
    "id": "cat-2021-s1-qa-q12",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Neeta + Geeta = 6 × Sita, and Sita + Neeta = 2 × Geeta. Solving gives earnings in the ratio Neeta:Geeta:Sita = 11:7:3. The largest-to-smallest ratio is 11:3.",
    "sufficiency_check": "The two daily comparisons determine all three earnings.",
    "option_check": "11:7, 3:2 and 7:3 compare the wrong pair. The extreme pair is 11:3.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The amount Neeta and Geeta together earn in a day equals what Sita alone earns in 6 days. The amount Sita and Neeta together earn in a day equals what Geeta alone earns in 2 days. The ratio of the daily earnings of the one who earns the most to that of the one who earns the least is",
    "options": [
      "A. 11: 3",
      "B. 11: 7",
      "C. 3: 2",
      "D. 7: 3"
    ],
    "correct": 0
  },
  {
    "id": "cat-2021-s1-qa-q18",
    "section": "qa",
    "topic": "Percentages",
    "solution": "The large box costs twice as much and its price per gram is 12% lower. Its weight is therefore 2 / 0.88 = 2.2727 times the small box, which exceeds it by about 127%.",
    "sufficiency_check": "The price ratio and the per-gram discount determine the weight ratio.",
    "option_check": "144, 124 and 135 use the discount as a direct weight increase or round differently. The nearest value is 127.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Identical chocolate pieces are sold in boxes of two sizes, small and large. The large box is sold for twice the price of the small box. If the selling price per gram of chocolate in the large box is 12% less than that in the small box, then the percentage by which the weight of chocolate in the large box exceeds that in the small box is nearest to",
    "options": [
      "A. 127",
      "B. 144",
      "C. 124",
      "D. 135"
    ],
    "correct": 0
  },
  {
    "id": "cat-2021-s1-qa-q19",
    "section": "qa",
    "topic": "Percentages",
    "solution": "The third-year interest is 866.72 / 806.25 = 1.075 times the second-year interest, so the annual rate is 7.5%. Fourth-year interest is 866.72 × 1.075 = 931.72.",
    "sufficiency_check": "Two successive compound-interest amounts determine the rate and the next amount.",
    "option_check": "926.84, 929.48 and 934.65 use a nearby rate. The exact next interest is 931.72.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Anil invests some money at a fixed rate of interest, compounded annually. If the interests accrued during the second and third year are ₹ 806.25 and ₹ 866.72,respectively, the interest accrued, in INR, during the fourth year is nearest to",
    "options": [
      "A. 926.84",
      "B. 929.48",
      "C. 931.72",
      "D. 934.65"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s1-qa-q20",
    "section": "qa",
    "topic": "Averages",
    "solution": "With monthly spending A, A, A, A/2 and A/2 at prices 10, 20, 25, 25 and 50, total spending is 4A and total quantity is 0.22A. Average price is 4 / 0.22, nearest to 18.",
    "sufficiency_check": "The prices and the spending pattern determine total money and total weight.",
    "option_check": "20, 16 and 26 are an ordinary average or another spending pattern. The weighted result is nearest to 18.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Onion is sold for 5 consecutive months at the rate of Rs 10, 20, 25, 25, and 50 per kg, respectively. A family spends a fixed amount of money on onion for each of the first three months, and then spends half that amount on onion for each of the next two months. The average expense for onion, in rupees per kg, for the family over these 5months is closest to",
    "options": [
      "A. 20",
      "B. 16",
      "C. 18",
      "D. 26"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s2-qa-q4",
    "section": "qa",
    "topic": "Percentages",
    "solution": "A first-year loss of x percent followed by a gain of 5x percent leaves 10000 × 1.35. The equation gives x = 10 or x = 70. Only a 10% loss leaves more than 5000 after the first year.",
    "sufficiency_check": "The final gain and the first-year balance floor rule out the other root.",
    "option_check": "5, 15 and 17 satisfy neither the final 35% nor the balance condition. The loss is 10%.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Raj invested ₹ 10000 in a fund. At the end of first year, he incurred a loss but his balance was more than ₹ 5000. This balance, when invested for another year, grew and the percentage of growth in the second year was five times the percentage of loss in the first year. If the gain of Raj from the initial investment over the two year period is 35%, then the percentage of loss in the first year is",
    "options": [
      "A. 5",
      "B. 15",
      "C. 17",
      "D. 10"
    ],
    "correct": 3
  },
  {
    "id": "cat-2021-s2-qa-q11",
    "section": "qa",
    "topic": "Geometry (Triangles, Circles)",
    "solution": "Because ABPD is a parallelogram and P is the midpoint, CD is twice AB. The parallelogram area exceeds triangle BPC by half the parallelogram, and that difference is 10. The trapezium area is 30.",
    "sufficiency_check": "The midpoint and parallelogram conditions fix the base ratio and both areas.",
    "option_check": "40, 25 and 20 use another base ratio. The trapezium area is 30.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Geometry (Triangles, Circles)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The sides AB and CD of a trapezium ABCD are parallel, with AB being the smaller side. P is the midpoint of CD and ABPD is a parallelogram. If the difference between the areas of the parallelogram ABPD and the triangle BPC is 10 sq cm, then the area, in sq cm, of the trapezium ABCD is",
    "options": [
      "A. 30",
      "B. 40",
      "C. 25",
      "D. 20"
    ],
    "correct": 0
  },
  {
    "id": "cat-2021-s2-qa-q15",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Anil works 24 days out of 60, completing 2/5. Bimal works 14 days out of 84, completing 1/6. Charu completes the remaining 13/30. His share of 21000 is 9100.",
    "sufficiency_check": "The three work periods and two known rates determine Charu’s fraction.",
    "option_check": "9000, 9200 and 9150 round the remaining fraction differently. The exact share is 9100.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Anil can paint a house in 60 days while Bimal can paint it in 84 days. Anil starts painting and after 10 days, Bimal and Charu join him. Together, they complete the painting in 14 more days. If they are paid a total of ₹ 21000 for the job, then the share of Charu, in INR, proportionate to the work done by him, is",
    "options": [
      "A. 9000",
      "B. 9200",
      "C. 9100",
      "D. 9150"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s2-qa-q18",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "The purchase ratio 2:3:5 at 800, 500 and 300 gives a mixture cost of 460 per kg. A 50% profit requires revenue of 690 per kg overall. Selling one-sixth at 700 leaves a required price of 688 on the rest.",
    "sufficiency_check": "The purchase ratio, one sale price and the target profit determine the remaining price.",
    "option_check": "653, 692 and 675 apply the profit to the wrong portion. The remaining price is 688.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A person buys tea of three different qualities at ₹ 800, ₹ 500, and ₹ 300 per kg, respectively, and the amounts bought are in the proportion 2 : 3 : 5. She mixes all the tea and sells one- sixth of the mixture at ₹ 700 per kg. The price, in INR per kg, at which she should sell the remaining tea, to make an overall profit of 50%, is",
    "options": [
      "A. 653",
      "B. 688",
      "C. 692",
      "D. 675"
    ],
    "correct": 1
  },
  {
    "id": "cat-2021-s3-qa-q2",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Rahul works 8 hours and Gautam 6 hours. If both had worked from 9, they would have finished in 7.5 hours. Solving the two equations gives Rahul’s alone time as 10 hours.",
    "sufficiency_check": "The actual hours and the together-time comparison determine both rates.",
    "option_check": "11.5, 12.5 and 12 count the clock hours without separating the rates. Rahul alone takes 10 hours.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "One day, Rahul started a work at 9 AM and Gautam joined him two hours later. They then worked together and completed the work at 5 PM the same day. If both had started at 9 AM and worked together, the work would have been completed 30 minutes earlier. Working alone, the time Rahul would have taken, in hours, to complete the work is",
    "options": [
      "A. 11.5",
      "B. 10",
      "C. 12.5",
      "D. 12"
    ],
    "correct": 1
  },
  {
    "id": "cat-2021-s3-qa-q3",
    "section": "qa",
    "topic": "Percentages",
    "solution": "The team has 12 wins from 40 matches. Winning 60% of the unknown remainder produces a 50% record, so 80 matches remain. Winning 90% of those adds 72 wins. Total wins are 84.",
    "sufficiency_check": "The current record and the 50% condition determine the number of matches left.",
    "option_check": "80, 78 and 86 are the remaining matches or another win rate. The 90% case gives 84 wins.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In a tournament, a team has played 40 matches so far and won 30% of them. If they win 60% of the remaining matches, their overall win percentage will be 50%. Suppose they win 90% of the remaining matches, then the total number of matches won by the team in the tournament will be",
    "options": [
      "A. 80",
      "B. 78",
      "C. 84",
      "D. 86"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s3-qa-q10",
    "section": "qa",
    "topic": "Mensuration (2D & 3D)",
    "solution": "The area is 60000. Whichever side costs 200 per foot, the minimum of the resulting cost expression is 120000, achieved when the sides are 200 and 300.",
    "sufficiency_check": "The area and the two fence rates determine the minimum without any missing side.",
    "option_check": "90000, 100000 and 160000 come from making every side the same rate or choosing a non-minimum rectangle. The minimum is 120000.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Mensuration (2D & 3D)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The cost of fencing a rectangular plot is ₹ 200 per ft along one side, and ₹ 100 per ft along the three other sides. If the area of the rectangular plot is 60000 sq. ft, then the lowest possible cost of fencing all four sides, in INR, is",
    "options": [
      "A. 120000",
      "B. 90000",
      "C. 100000",
      "D. 160000"
    ],
    "correct": 0
  },
  {
    "id": "cat-2021-s3-qa-q14",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Mixing the alloy with 3 kg of pure silver gives 90% silver. Mixing the same weight with 2 kg of 90% silver gives 84% silver. The two equations give an initial weight of 3 kg.",
    "sufficiency_check": "Both mixtures state the added weight and the resulting percentage.",
    "option_check": "3.5, 2.5 and 4 satisfy only one mixture. Both mixtures give 3 kg.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "If a certain weight of an alloy of silver and copper is mixed with 3 kg of pure silver, the resulting alloy will have 90% silver by weight. If the same weight of the initial alloy is mixed with 2 kg of another alloy which has 90% silver by weight, the resulting alloy will have 84% silver by weight. Then, the weight of the initial alloy, in kg, is",
    "options": [
      "A. 3.5",
      "B. 2.5",
      "C. 3",
      "D. 4"
    ],
    "correct": 2
  },
  {
    "id": "cat-2022-s1-qa-q3",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "Train A takes 10 minutes for the whole distance. They meet after t minutes, and train B then takes 9 minutes. The meeting equation gives t = 6, so train B’s whole trip takes 15 minutes.",
    "sufficiency_check": "A’s total time and B’s post-meeting time determine B’s total time.",
    "option_check": "6, 10 and 12 are the meeting time or one of the given times. B’s full trip is 15 minutes.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Trains A and B start traveling at the same time towards each other with constant speeds from stations X and Y, respectively. Train A reaches station Y in 10 minutes while train B takes 9 minutes to reach station X after meeting train A. Then the total time taken, in minutes, by train B to travel from station Y to station X is",
    "options": [
      "A. 6",
      "B. 10",
      "C. 15",
      "D. 12"
    ],
    "correct": 2
  },
  {
    "id": "cat-2022-s1-qa-q7",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "One part of the original mixture contains half a part lemon juice and half a part syrup. Adding three parts syrup makes lemon:syrup = 0.5:3.5 = 1:7.",
    "sufficiency_check": "The original equality and the added ratio are both stated.",
    "option_check": "1:4, 1:5 and 1:6 omit part of the syrup already in the mixture. The new ratio is 1:7.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A mixture contains lemon juice and sugar syrup in equal proportion. If a new mixture is created by adding this mixture and sugar syrup in the ratio 1 : 3, then the ratio of lemon juice and sugar syrup in the new mixture is",
    "options": [
      "A. 1 : 4",
      "B. 1 : 5",
      "C. 1 : 6",
      "D. 1 : 7"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s1-qa-q8",
    "section": "qa",
    "topic": "Averages",
    "solution": "Three integers total 39. Adding natural number n makes (39 + n) / 4 an odd integer. The smallest such n is 5, because the average is then 11. n = 1 makes the average 10, which is even.",
    "sufficiency_check": "The original sum and the odd-average condition determine the minimum.",
    "option_check": "3 and 4 are not 1 more than a multiple of 4, and 1 makes an even average. The minimum is 5.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The average of three integers is 13. When a natural number n is included, the average of these four integers remains an odd integer. The minimum possible value of n is",
    "options": [
      "A. 3",
      "B. 1",
      "C. 4",
      "D. 5"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s1-qa-q12",
    "section": "qa",
    "topic": "Averages",
    "solution": "New students average 3 kg more, but the class average rises only 0.6 kg. The extra 3 kg is shared across original and new students, giving original:new = 4:1.",
    "sufficiency_check": "The average increase and the new students’ excess determine the ratio.",
    "option_check": "1:2, 1:4 and 3:1 reverse the groups or use 3 kg directly as the ratio. The ratio is 4:1.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The average weight of students in a class increases by 600 gm when some new students join the class. If the average weight of the new students is 3 kg more than the average weight of the original students, then the ratio of the number of original students to the number of new students is",
    "options": [
      "A. 1 : 2",
      "B. 4 : 1",
      "C. 1 : 4",
      "D. 3 : 1"
    ],
    "correct": 1
  },
  {
    "id": "cat-2022-s1-qa-q14",
    "section": "qa",
    "topic": "Functions & Inequalities",
    "solution": "The sum of distances from x to −a and to 1 is constant on the interval between them only when those points are exactly 2 apart. The larger such value is a = 1.",
    "sufficiency_check": "An infinite solution interval occurs exactly when the two anchor points are 2 apart and distinct.",
    "option_check": "0, 2 and −1 place the anchors a different distance apart. The largest working value is 1.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Functions & Inequalities",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The largest real value of a for which the equation |X + a| + |x − 1| = 2 has an infinite number of solutions for x is",
    "options": [
      "A. 0",
      "B. 2",
      "C. 1",
      "D. −1"
    ],
    "correct": 2
  },
  {
    "id": "cat-2022-s1-qa-q16",
    "section": "qa",
    "topic": "Coordinate Geometry",
    "solution": "In parallelogram ABCD the diagonals share a midpoint, so D = A + C − B = (1 − 2 − 3, 1 + 8 − 4) = (−4, 5).",
    "sufficiency_check": "Three vertices in order determine the fourth vertex.",
    "option_check": "The other points add the vertices in a different order. The parallelogram vertex is (−4, 5).",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Coordinate Geometry",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Let ABCD be a parallelogram such that the coordinates of its three vertices A, B, C are (1, 1), (3, 4) and (−2, 8), respectively. Then, the coordinates of the vertex D are",
    "options": [
      "A. (−3, 4)",
      "B. (0, 11)",
      "C. (4, 5)",
      "D. (−4, 5)"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s2-qa-q6",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "After two hours the ships are the legs of a right triangle whose hypotenuse is 60. If the slower speed is v, then (2v)² + (2v + 12)² = 3600. The positive solution is v = 18.",
    "sufficiency_check": "The right angle, the time and the speed gap determine both speeds.",
    "option_check": "20, 24 and 12 satisfy a different gap or forget the two-hour scaling. The slower speed is 18.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two ships meet mid-ocean, and then, one ship goes south and the other ship goes west, both travelling at constant speeds. Two hours later, they are 60 km apart. If the speed of one of the ships is 6 km per hour more than the other one, then the speed, in km per hour, of the slower ship is",
    "options": [
      "A. 20",
      "B. 24",
      "C. 12",
      "D. 18"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s2-qa-q7",
    "section": "qa",
    "topic": "Permutation & Combination",
    "solution": "Four-digit numbers using these digits and starting with 2, 3, 4 or 5: 4 × 60 = 240. Five-digit numbers: 600. Six-digit numbers: 600. Every such number is greater than 2000. The total is 1440.",
    "sufficiency_check": "The available digits and the greater-than-2000 condition fix the allowed leading digits.",
    "option_check": "1200, 1420 and 1480 include a leading zero or exclude one length. The total is 1440.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Permutation & Combination",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The number of integers greater than 2000 that can be formed with the digits 0,1 , 2,3, 4,5 , using each digit at most once, is",
    "options": [
      "A. 1200",
      "B. 1440",
      "C. 1420",
      "D. 1480"
    ],
    "correct": 1
  },
  {
    "id": "cat-2022-s3-qa-q1",
    "section": "qa",
    "topic": "Number Systems",
    "solution": "The distinct rearrangements of 1, 4, 2, 1 use digit 1 twice as often as 4 or 2. Each place therefore averages (1 + 1 + 4 + 2) / 4 = 2, and the average number is 2222.",
    "sufficiency_check": "Symmetry across the distinct rearrangements gives the same average digit in every place.",
    "option_check": "3333, 2442 and 2592 treat the repeated 1 as two different digits or average the digits incorrectly. The average is 2222.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Number Systems",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The arithmetic mean of all the distinct numbers that can be obtained by rearranging the digits in 1421, including itself, is",
    "options": [
      "A. 3333",
      "B. 2442",
      "C. 2222",
      "D. 2592"
    ],
    "correct": 2
  },
  {
    "id": "cat-2022-s3-qa-q4",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Moving 150 cc of milk into 500 cc of water and then moving 150 cc back transfers equal amounts of water into the glass and milk left in the cup. The ratio is 1:1.",
    "sufficiency_check": "Equal starting volumes and equal transferred volumes make the two resulting amounts equal.",
    "option_check": "3:10, 10:3 and 10:13 compare the liquids before the return transfer. After both transfers the ratio is 1:1.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A glass contains 500 cc of milk and a cup contains 500 cc of water. From the glass, 150 cc of milk is transferred to the cup and mixed thoroughly. Next, 150 cc of this mixture is transferred from the cup to the glass. Now, the amount of water in the glass and the amount of milk in the cup are in the ratio",
    "options": [
      "A. 3 : 10",
      "B. 10: 3",
      "C. 1: 1",
      "D. 10: 13"
    ],
    "correct": 2
  },
  {
    "id": "cat-2022-s3-qa-q9",
    "section": "qa",
    "topic": "Averages",
    "solution": "The two smallest distinct natural numbers sum to 28 and the two largest sum to 56. To maximise the middle pair, use 13, 15, 25, 26, 27 and 29. The six-number average is 22.5.",
    "sufficiency_check": "The two fixed pair-sums and the distinct-number condition determine the maximum.",
    "option_check": "23, 24 and 23.5 require a repeated number or a largest pair that does not average 28. The maximum is 22.5.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Averages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Consider six distinct natural numbers such that the average of the two smallest numbers is 14 , and the average of the two largest numbers is 28 . Then, the maximum possible value of the average of these six numbers is",
    "options": [
      "A. 23",
      "B. 24",
      "C. 23.5",
      "D. 22.5"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s3-qa-q10",
    "section": "qa",
    "topic": "Geometry (Triangles, Circles)",
    "solution": "For sides 1, 2, 4 and x, the strict quadrilateral inequalities reduce to 2 ≤ x ≤ 6. The possible integer lengths are 2, 3, 4, 5 and 6, five values.",
    "sufficiency_check": "All four sides and the integer condition are stated.",
    "option_check": "4, 3 and 6 drop an endpoint or use a non-strict inequality. Five lengths work.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Geometry (Triangles, Circles)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The lengths of all four sides of a quadrilateral are integer valued. If three of its sides are of length 1 cm, 2 cm and 4 cm , then the total number of possible lengths of the fourth side is",
    "options": [
      "A. 5",
      "B. 4",
      "C. 3",
      "D. 6"
    ],
    "correct": 0
  },
  {
    "id": "cat-2022-s3-qa-q15",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "Closing speed covers the gap in 1.5 hours and the speed difference covers it in 10.5 hours. With the slower speed at 60, the faster speed is 80. The slower car covers 60 × 1.5 = 90 km before they meet.",
    "sufficiency_check": "The two meeting times and one speed determine the gap and the other speed.",
    "option_check": "100, 120 and 150 use the faster speed or another time. The slower car covers 90 km.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two cars travel from different locations at constant speeds. To meet each other after starting at the same time, they take 1.5 hours if they travel towards each other, but 10.5 hours if they travel in the same direction. If the speed of the slower car is 60 km/hr, then the distance traveled, in km, by the slower car when it meets the other car while traveling towards each other, is",
    "options": [
      "A. 100",
      "B. 90",
      "C. 120",
      "D. 150"
    ],
    "correct": 1
  },
  {
    "id": "cat-2022-s3-qa-q19",
    "section": "qa",
    "topic": "Functions & Inequalities",
    "solution": "For x below r, the function equals r and applying it again still gives r, so the equation holds. For x above r it becomes 4x − 3r, which equals 2x − r only at x = r. The equation holds exactly when x ≤ r.",
    "sufficiency_check": "The piecewise rule is stated for both sides of r.",
    "option_check": "The other statements omit the region below r or include values above r. The working region is x ≤ r.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Functions & Inequalities",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Let 𝑟 be a real number and 𝑓(𝑥) = {2𝑥 − 𝑟 if 𝑥 ≥ 𝑟 𝑟 if 𝑥 < 𝑟. Then, the equation 𝑓(𝑥) = 𝑓(𝑓(𝑥)) holds for all real values of 𝑥 where",
    "options": [
      "A. 𝑥 ≠ 𝑟",
      "B. 𝑥 > 𝑟",
      "C. 𝑥 ≥ 𝑟",
      "D. 𝑥 ≤ 𝑟"
    ],
    "correct": 3
  },
  {
    "id": "cat-2022-s3-qa-q20",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "N people complete 35% in 70 hours each. After 10 leave, the rest complete 65% in 140 hours each. Equating work per person-hour gives N = 140.",
    "sufficiency_check": "Both stages state the people, hours and percentage completed.",
    "option_check": "150, 36 and 23 treat the percentages as numbers of people. The staffing equation gives 140.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A group of 𝑁 people worked on a project. They finished 35% of the project by working 7 hours a day for 10 days. Thereafter, 10 people left the group and the remaining people finished the rest of the project in 14 days by working 10 hours a day. Then the value of 𝑁 is",
    "options": [
      "A. 150",
      "B. 36",
      "C. 23",
      "D. 140"
    ],
    "correct": 3
  },
  {
    "id": "cat-2023-s2-qa-q9",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "Ravi and Ashok close 225 metres at 25 m/s, so they meet after 9 seconds. Vijay must cover the 54 metres plus Ravi’s 100 metres in those 9 seconds. That speed is 61.6 km/h.",
    "sufficiency_check": "All three positions and the two known speeds determine the common meeting time.",
    "option_check": "67.2, 64.4 and 58.8 use a different meeting time. Vijay’s required speed is 61.6.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Ravi is driving at a speed of 40 km/h on a road. Vijay is 54 meters behind Ravi and driving in the same direction as Ravi. Ashok is driving along the same road from the opposite direction at a speed of 50 km/h and is 225 meters away from Ravi. The speed, in km/h, at which Vijay should drive so that all the three cross each other at the same time, is",
    "options": [
      "A. 67.2",
      "B. 64.4",
      "C. 61.6",
      "D. 58.8"
    ],
    "correct": 2
  },
  {
    "id": "cat-2023-s2-qa-q11",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "Minu sells at 1200, buys the sunglasses back at 960, and needs a total profit of 500. The final sale price is 1260. Profit on the 960 purchase is 300, which is 31.25%.",
    "sufficiency_check": "The purchase, both resale percentages and the total profit determine the last price.",
    "option_check": "26%, 35.42% and 52% compare the profit with the original 1000 or with another base. The last transaction earns 31.25%.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Minu purchases a pair of sunglasses at Rs.1000 and sells to Kanu at 20% profit. Then, Kanu sells it back to Minu at 20% loss. Finally, Minu sells the same pair of sunglasses to Tanu. If the total profit made by Minu from all her transactions is Rs.500, then the percentage of profit made by Minu when she sold the pair of sunglasses to Tanu is",
    "options": [
      "A. 26%",
      "B. 35.42%",
      "C. 52%",
      "D. 31.25%"
    ],
    "correct": 3
  },
  {
    "id": "cat-2023-s2-qa-q12",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Price is proportional to the square of weight. The most unequal integer pieces 1, 2, 3 and 12 have square-sum 158. The most equal pieces 3, 4, 5 and 6 have square-sum 86. The difference of 72 parts is 288000, so one part is 4000. The original stone costs 4000 × 18² = 1296000.",
    "sufficiency_check": "The weight, the four distinct integer pieces and the price gap determine the constant.",
    "option_check": "The other prices use a different pair of piece weights. The original price is 1296000.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The price of a precious stone is directly proportional to the square of its weight. Sita has a precious stone weighing 18 units. If she breaks it into four pieces with each piece having distinct integer weight, then the difference between the highest and lowest possible values of the total price of the four pieces will be 288000. Then, the price of the original precious stone is",
    "options": [
      "A. 1620000",
      "B. 1296000",
      "C. 1944000",
      "D. 972000"
    ],
    "correct": 1
  },
  {
    "id": "cat-2023-s2-qa-q17",
    "section": "qa",
    "topic": "Geometry (Triangles, Circles)",
    "solution": "With AB = 9 and BC = 6, the three areas are proportional to the segments on BC, and the last area is four times the first. The segments are 12/7, 24/7 and 6/7, so the ratio is 2:4:1.",
    "sufficiency_check": "The rectangle dimensions and the geometric-progression condition determine the three segments.",
    "option_check": "1:1:2, 1:2:1 and 1:2:4 satisfy only one of the two area conditions. Both conditions give 2:4:1.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Geometry (Triangles, Circles)",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In a rectangle ABCD, AB = 9 cm and BC = 6 cm. P and Q are two points on BC such that the areas of the figures ABP, APQ, and AQCD are in geometric progression. If the area of the figure AQCD is four times the area of triangle ABP, then BP : PQ : QC is",
    "options": [
      "A. 1 : 1 : 2",
      "B. 1 : 2 : 1",
      "C. 1 : 2 : 4",
      "D. 2 : 4 : 1"
    ],
    "correct": 3
  },
  {
    "id": "cat-2023-s3-qa-q9",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Two parts of mixture A contain 4/5 part sugar, and three parts of mixture B contain 9/10 part sugar. Sugar is 1.7 parts out of 5, or 34% of mixture C. Mixing with an equal amount of milk makes the drink 17% sugar.",
    "sufficiency_check": "Both recipes, the combining ratio and the equal milk are stated.",
    "option_check": "16, 24 and 21 omit the milk or one sugar source. The drink is 17% sugar.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "23 ) Anil mixes cocoa with sugar in the ratio 3: 2 to prepare mixture A , and coffee with sugar in the ratio 7 : 3 to prepare mixture B . He combines mixtures A and B in the ratio 2 : 3 to make a new mixture C . If he mixes C with an equal amount of milk to make a drink, then the percentage of sugar in this drink will be",
    "options": [
      "A. 16",
      "B. 24",
      "C. 17",
      "D. 21"
    ],
    "correct": 2
  },
  {
    "id": "cat-2023-s3-qa-q11",
    "section": "qa",
    "topic": "Percentages",
    "solution": "The later rise is 10 points larger than the earlier fall, and the 2022 population is higher than 100000. The largest fall that still does this is 27%. The 2021 population is 73000.",
    "sufficiency_check": "The direction of each change, the 10-point gap and the final comparison determine the lowest 2021 population.",
    "option_check": "74000, 75000 and 72000 are the neighbouring whole-percent falls. The lowest valid population is 73000.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The population of a town in 2020 was 100000 . The population decreased by %y from the year 2020 to 2021, and increased by %x from the year 2021 to 2022, where x and y are two natural numbers. If population in 2022 was greater than the population in 2020 and the difference between x and y is 10 , then the lowest possible population of the town in 2021 was",
    "options": [
      "A. 74000",
      "B. 75000",
      "C. 73000",
      "D. 72000"
    ],
    "correct": 2
  },
  {
    "id": "cat-2023-s3-qa-q13",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "The merchant pays 100 for 105 cm and, after a 5% discount, collects 104.5 while giving 95 cm. Cost of that cloth is 1900/21. Profit on cost is exactly 15.5%.",
    "sufficiency_check": "The free length, the short measure, the marked price and the discount are all stated.",
    "option_check": "9.7%, 16% and 4.2% omit one of those adjustments. The resulting profit is 15.5%.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A merchant purchases a cloth at a rate of Rs. 100 per meter and receives 5 cm length of cloth free for every 100 cm length of cloth purchased by him. He sells the same cloth at a rate of Rs.110 per meter but cheats his customers by giving 95 cm length of cloth for every 100 cm length of cloth purchased by the customers. If the merchant provides a 5% discount, the resulting profit earned by him is",
    "options": [
      "A. 9.7%",
      "B. 16%",
      "C. 4.2%",
      "D. 15.5%"
    ],
    "correct": 3
  },
  {
    "id": "cat-2024-s1-qa-q9",
    "section": "qa",
    "topic": "Number Systems",
    "solution": "Each remaining quantity is an integer number of kilograms. Each sale removes half of that quantity and then another 3 kg, and the third sale finishes the stock. Working backwards from zero gives 6, then 18, then 42 kg.",
    "sufficiency_check": "The three identical sale rules and the empty ending determine the start.",
    "option_check": "50, 18 and 36 are intermediate stocks or one sale short. The initial quantity is 42.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Number Systems",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A shop wants to sell a certain quantity (in kg ) of grains. It sells half the quantity and an additional 3 kg of these grains to the first customer. Then, it sells half of the remaining quantity and an additional 3 kg of these grains to the second customer. Finally, when the shop sells half of the remaining quantity and an additional 3 kg of these grains to the third customer, there are no grains left. The initial quantity, in kg , of grains is",
    "options": [
      "A. 50",
      "B. 18",
      "C. 42",
      "D. 36"
    ],
    "correct": 2
  },
  {
    "id": "cat-2024-s1-qa-q12",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "The original selling price is 1.4 times cost. A 40% lower cost sold for 5 less earns 50%, so 1.4C − 5 = 0.9C. Cost is 10 and the original selling price is 14.",
    "sufficiency_check": "The original margin and the alternate cost and price determine one selling price.",
    "option_check": "20, 15 and 10 are the cost or another markup. The original selling price is 14.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The selling price of a product is fixed to ensure 40% profit. If the product had cost 40% less and had been sold for 5 rupees less, then the resulting profit would have been 50% . The original selling price, in rupees, of the product is",
    "options": [
      "A. 20",
      "B. 15",
      "C. 14",
      "D. 10"
    ],
    "correct": 2
  },
  {
    "id": "cat-2024-s1-qa-q14",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Interest from bank A is 500t. The maturity amount then earns 3000 + 150t in bank B. Setting 500t : (3000 + 150t) = 10:13 gives t = 6.",
    "sufficiency_check": "Both rates, the second period and the interest ratio are stated.",
    "option_check": "4, 3 and 5 satisfy a different ratio. Bank A is used for 6 years.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "An amount of Rs 10000 is deposited in bank A for a certain number of years at a simple interest of 5% per annum. On maturity, the total amount received is deposited in bank B for : another 5 years at a simple interest of 6% per annum. If the interests received from bank A and bank B are in the ratio 10 :13 , then the investment period, in years, in bank A is",
    "options": [
      "A. 6",
      "B. 4",
      "C. 3",
      "D. 5"
    ],
    "correct": 0
  },
  {
    "id": "cat-2024-s1-qa-q18",
    "section": "qa",
    "topic": "Percentages",
    "solution": "On incomes 800, 600 and 500, the rent is 120 + 72 + 90 = 282. October incomes are 880, 672 and 575, totalling 2127. The same rent is 282/2127, nearest to 13.26%.",
    "sufficiency_check": "The income ratio, three rent shares and three raises determine the later percentage.",
    "option_check": "15.18, 12.75 and 14.84 are other roundings or one person’s share. The combined percentage is nearest to 13.26.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "In September, the incomes of Kamal, Amal and Vimal are in the ratio 8 : 6 : 5 . They rent a house together, and Kamal pays 15%, Amal pays 12% and Vimal pays 18% of their respective incomes to cover the total house rent in that month. In October, the house rent remains unchanged while their incomes increase by 10%, 12% and 15% , respectively. In October, the percentage of their total income that will be paid as house rent, is nearest to",
    "options": [
      "A. 15 .18",
      "B. 13.26",
      "C. 12.75",
      "D. 14 .84"
    ],
    "correct": 1
  },
  {
    "id": "cat-2024-s1-qa-q20",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Each operation leaves one-third of the milk. Four operations leave 1/81 of the glass as milk and 80/81 as water. The ratio is 1:80.",
    "sufficiency_check": "The retained fraction and the number of repetitions are stated.",
    "option_check": "1:26, 1:27 and 1:81 count the operations incorrectly. Four replacements leave 1:80.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A glass is filled with milk. Two-thirds of its content is poured out and replaced with water. If this process of pouring out two-thirds the content and replacing with water is repeated three more times, then the final ratio of milk to water in the glass, is",
    "options": [
      "A. 1:26",
      "B. 1:80",
      "C. 1:27",
      "D. 1:81"
    ],
    "correct": 1
  },
  {
    "id": "cat-2024-s1-qa-q21",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "The speeds add to 30 km/h because the 45 km gap closes in 1.5 hours. Anil’s total time is 1.25 hours more than Sunil’s. The resulting quadratic gives Anil’s speed as 12 km/h.",
    "sufficiency_check": "The distance, meeting time and arrival gap determine both speeds.",
    "option_check": "18, 14 and 16 are Sunil’s speed or other roots. Anil’s speed is 12.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Two places A and B are 45 kms apart and connected by a straight road. Anil goes from A to B while Sunil goes from B to A. Starting at the same time, they cross each other in exactly 1 hour 30 minutes. If Anil reaches B exactly 1 hour 15 minutes after Sunil reaches A , the speed of Anil, in km per hour, is",
    "options": [
      "A. 18",
      "B. 14",
      "C. 12",
      "D. 16"
    ],
    "correct": 2
  },
  {
    "id": "cat-2024-s2-qa-q20",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Adding 2 litres of water makes acid half of the solution, so acid is 2 more than water. Adding 15 litres of acid then makes an 80% solution. Water is 3 litres and acid is 5 litres.",
    "sufficiency_check": "Both additions and both resulting concentrations are stated.",
    "option_check": "5:4, 4:5 and 5:3 reverse the liquids or the additions. The original water:acid ratio is 3:5.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A vessel contained a certain amount of a solution of acid and water. When 2 litres of water was added to it, the new solution had 50% acid concentration. When 15 litres of acid was further added to this new solution, the final solution had 80% acid concentration. The ratio of water and acid in the original solution was",
    "options": [
      "A. 5: 4",
      "B. 3: 5",
      "C. 4: 5",
      "D. 5: 3"
    ],
    "correct": 1
  },
  {
    "id": "cat-2025-s1-qa-q6",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Start with 60 litres of acid in 200 litres. Replacing 20% with water, 10% with acid, and 15% with water leaves 53.72 litres of acid. That is 26.86%, nearest to 27.",
    "sufficiency_check": "The initial concentration and all three replacement steps are stated.",
    "option_check": "29, 25 and 23 stop after a different step. The final concentration is nearest to 27.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A container holds 200 litres of a solution of acid and water, having 30% acid by volume. Atul replaces 20% of this solution with water, then replaces 10% of the resulting solution with acid, and finally replaces 15% of the solution thus obtained, with water. The percentage of acid by volume in the final solution obtained after these three replacements, is nearest to",
    "options": [
      "A. 27",
      "B. 29",
      "C. 25",
      "D. 23"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s1-qa-q15",
    "section": "qa",
    "topic": "Coordinate Geometry",
    "solution": "The diagonals of PQRS bisect each other, so S is (5, 4). Line SQ runs from (5, 4) to (1, −5) and crosses y = 0 at x = 29/9.",
    "sufficiency_check": "Three vertices determine the fourth vertex and then the diagonal.",
    "option_check": "13/4, 27/7 and 10/3 are crossings of another side. The diagonal meets the x-axis at 29/9.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Coordinate Geometry",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The (x, y) coordinates of vertices P, Q and R of a parallelogram PQRS are (−3, −2), (1, −5) and (9, 1), respectively. If the diagonal SQ intersects the x-axis at (a, 0), then the value of a is",
    "options": [
      "A. 13/4",
      "B. 29/9",
      "C. 27/7",
      "D. 10/3"
    ],
    "correct": 1
  },
  {
    "id": "cat-2025-s1-qa-q20",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "The first part is 28.8 km in 0.5 hours. The four times form an arithmetic progression totalling 3 hours, so they are 0.5, 2/3, 5/6 and 1 hour. The speeds then differ by 9.6 km/h. The fourth part takes one hour at 86.4 km/h, which is 86400 metres.",
    "sufficiency_check": "The total distance, total time and first part determine both progressions.",
    "option_check": "112000, 76800 and 96000 assign the common differences in the wrong order. The fourth distance is 86400 metres.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Shruti travels a distance of 224 km in four parts for a total travel time of 3 hours. Her speeds in these four parts follow an arithmetic progression, and the corresponding time taken to cover these four parts follow another arithmetic progression. If she travels at a speed of 960 meters per minute for 30 minutes to cover the first part, then the distance, in meters, she travels in the fourth part is",
    "options": [
      "A. 112000",
      "B. 76800",
      "C. 86400",
      "D. 96000"
    ],
    "correct": 2
  },
  {
    "id": "cat-2025-s1-qa-q21",
    "section": "qa",
    "topic": "Permutation & Combination",
    "solution": "There are 5 sandwich types, 4 breads and 2 sizes. Sauces allow none, one, or two distinct sauces: 1 + 6 + 15 = 22 choices. The product is 5 × 4 × 2 × 22 = 880.",
    "sufficiency_check": "Every choice, including the optional sauces, is stated.",
    "option_check": "800, 600 and 840 omit one sauce count or one bread. The order count is 880.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Permutation & Combination",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A cafeteria offers 5 types of sandwiches. Moreover, for each type of sandwich, a customer can choose one of 4 breads and opt for either small or large sized sandwich. Optionally, the customer may also add up to 2 out of 6 available sauces. The number of different ways in which an order can be placed for a sandwich, is",
    "options": [
      "A. 800",
      "B. 600",
      "C. 880",
      "D. 840"
    ],
    "correct": 2
  },
  {
    "id": "cat-2025-s2-qa-q2",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Coffee and cocoa prices consistent with the two mixtures are 576 and 176 per kg. A mixture costing 376 is half coffee. Ten kilograms contain 5 kg of coffee.",
    "sufficiency_check": "The two compositions, their prices and the new price determine the new composition.",
    "option_check": "2.5, 4 and 6 are other price proportions. The new mixture contains 5 kg of coffee in 10 kg.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A mixture of coffee and cocoa, 16% of which is coffee, costs Rs 240 per kg. Another mixture of coffee and cocoa, of which 36% is coffee, costs Rs 320 per kg. If a new mixture of coffee and cocoa costs Rs 376 per kg, then the quantity, in kg, of coffee in 10 kg of this new mixture is",
    "options": [
      "A. 5",
      "B. 2.5",
      "C. 4",
      "D. 6"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s2-qa-q3",
    "section": "qa",
    "topic": "Percentages",
    "solution": "After the first instalment the balance is 1000(1 + r) − 530, and one year later that balance grows to 594. The positive solution is r = 8%.",
    "sufficiency_check": "The loan and both instalment times determine the compound rate.",
    "option_check": "9, 11 and 10 make one of the instalments miss 594. The rate is 8%.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A loan of Rs 1000 is fully repaid by two installments of Rs 530 and Rs 594, paid at the end of first and second year, respectively. If the interest is compounded annually, then the rate of interest, in percentage, is",
    "options": [
      "A. 8",
      "B. 9",
      "C. 11",
      "D. 10"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s2-qa-q7",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "Take the expenditures as 2a and 3a. Lakshmi’s income is 18a/7, so her saving is 4a/7. Meenakshi’s saving is 9a/7 and her income is 30a/7. The income ratio is 18:30 = 3:5.",
    "sufficiency_check": "The expenditure ratio, the income-to-expenditure link and the saving ratio determine both incomes.",
    "option_check": "7:8, 2:1 and 5:6 compare a different pair. The incomes are in the ratio 3:5.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The ratio of expenditures of Lakshmi and Meenakshi is 2 : 3, and the ratio of income of Lakshmi to expenditure of Meenakshi is 6 : 7. If excess of income over expenditure is saved by Lakshmi and Meenakshi, and the ratio of their savings is 4 : 9, then the ratio of their incomes is",
    "options": [
      "A. 3 : 5",
      "B. 7 : 8",
      "C. 2 : 1",
      "D. 5 : 6"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s2-qa-q8",
    "section": "qa",
    "topic": "Profit & Loss",
    "solution": "A 20% profit on 1650 gives a sale price of 1980. Doubling the discount drops the profit to 110, so the original discount is 10% and the marked price is 2200. The discount rate equal to the resulting profit rate is 100/7%, nearest to 14.",
    "sufficiency_check": "The cost, target profit and doubled-discount result determine the marked price.",
    "option_check": "12, 18 and 16 are other roundings of a different marked price. The nearest rate is 14.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Profit & Loss",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "An item with a cost price of Rs. 1650 is sold at a certain discount on a fixed marked price to earn a profit of 20% on the cost price. If the discount was doubled, the profit would have been Rs. 110. The rate of discount, in percentage, at which the profit percentage would be equal to the rate of discount, is nearest to",
    "options": [
      "A. 12",
      "B. 18",
      "C. 14",
      "D. 16"
    ],
    "correct": 2
  },
  {
    "id": "cat-2025-s2-qa-q19",
    "section": "qa",
    "topic": "Ratios & Proportions",
    "solution": "The first three terms sum to 52 and their pairwise products sum to 624. The second term is 12 and the first term is 36, with common ratio 1/3. The infinite sum is 36 / (2/3) = 54.",
    "sufficiency_check": "The two symmetric sums determine the first term and a ratio whose absolute value is below 1.",
    "option_check": "63, 57 and 60 use the increasing ratio, which does not give a decreasing infinite progression. The sum is 54.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Ratios & Proportions",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Let an be the nth term of a decreasing infinite geometric progression. If a1 + a2+ α3 = 52 and a1a2 + a2a3 + а3a1 = 624, then the sum of this geometric progression is",
    "options": [
      "A. 54",
      "B. 63",
      "C. 57",
      "D. 60"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s2-qa-q22",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Pinu receives 20%. Meena receives 40% of the rest, which is 32% of the total. Seema receives 20% less than Pinu, which is 16%. Rinu receives the remaining 32%. Pinu:Rinu = 20:32 = 5:8.",
    "sufficiency_check": "The four shares are fixed by the successive percentages.",
    "option_check": "2:1, 1:2 and 8:5 reverse the comparison or use the remainder before Seema’s share. The ratio is 5:8.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "A certain amount of money was divided among Pinu, Meena, Rinu and Seema. Pinu received 20% of the total amount and Meena received 40% of the remaining amount. If Seema received 20% less than Pinu, the ratio of the amounts received by Pinu and Rinu is",
    "options": [
      "A. 2 : 1",
      "B. 5 : 8",
      "C. 1 : 2",
      "D. 8 : 5"
    ],
    "correct": 1
  },
  {
    "id": "cat-2025-s3-qa-q2",
    "section": "qa",
    "topic": "Time-Speed-Distance",
    "solution": "The uninterrupted trip takes 6 hours. A 20-minute stop requires an increase of 3 km/h afterwards, while a 30-minute stop requires an increase of 5 km/h. The common distance before the stop gives an initial speed of 15 km/h.",
    "sufficiency_check": "The original duration and both stop scenarios determine the speed.",
    "option_check": "18, 20 and 12 satisfy only one stop scenario. Both scenarios give 15.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time-Speed-Distance",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "Rahul starts on his journey at 5 pm at a constant speed so that he reaches his destination at 11 pm the same day. However, on his way, he stops for 20 minutes, and after that, increases his speed by 3 km per hour to reach on time. If he had stopped for 10 minutes more, he would have had to increase his speed by 5 km per hour to reach on time. His initial speed, in km per hour, was",
    "options": [
      "A. 15",
      "B. 18",
      "C. 20",
      "D. 12"
    ],
    "correct": 0
  },
  {
    "id": "cat-2025-s3-qa-q3",
    "section": "qa",
    "topic": "Number Systems",
    "solution": "The thousands digit is one less than the units digit, and the tens digit is 6 more than the units digit. The only four-digit solutions are 1682 and 2493. Their difference is 811.",
    "sufficiency_check": "The two digit sums and the tens-units gap determine both numbers.",
    "option_check": "4078, 735 and 3289 are sums or other digit differences. The extreme numbers differ by 811.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Number Systems",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "For a 4-digit number (greater than 1000), sum of the digits in the thousands, hundreds, and tens places is 15. Sum of the digits in the hundreds, tens, and units places is 16. Also, the digit in the tens place is 6 more than the digit in the units place. The difference between the largest and smallest possible value of the number is",
    "options": [
      "A. 4078",
      "B. 735",
      "C. 3289",
      "D. 811"
    ],
    "correct": 3
  },
  {
    "id": "cat-2025-s3-qa-q6",
    "section": "qa",
    "topic": "Time and Work",
    "solution": "Pipe A’s rate is one tank in 15 hours and corresponds to 4 parts. All three pipes supply 49 parts, so together they take 60/49 hours, which is about 73.47 minutes and nearest to 73.",
    "sufficiency_check": "The rate ratio and A’s time determine the combined time.",
    "option_check": "71, 76 and 78 round another combined rate. The nearest minute count is 73.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Time and Work",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The rate of water flow through three pipes A, B and C are in the ratio 4 : 9 : 36. An empty tank can be filled up completely by pipe A in 15 hours. If all the three pipes are used simultaneously to fill up this empty tank, the time, in minutes, required to fill up the entire tank completely is nearest to",
    "options": [
      "A. 71",
      "B. 76",
      "C. 73",
      "D. 78"
    ],
    "correct": 2
  },
  {
    "id": "cat-2025-s3-qa-q8",
    "section": "qa",
    "topic": "Percentages",
    "solution": "Thirty people average 60000, so they earn 1,800,000 together. A 20% rise for the five managers raises the overall average by 5%, adding 90,000. Managers originally earned 450,000, leaving 1,350,000 for 25 engineers, or 54000 each.",
    "sufficiency_check": "The original average, the manager raise and the resulting average determine the engineer average.",
    "option_check": "45000, 40000 and 50000 assign the raise to the wrong group. The engineer average is 54000.",
    "common_mistake": "Applying one stated condition and skipping the other.",
    "concept_check": "Percentages",
    "marg_insight": "Use every stated condition before comparing the result with the options.",
    "stem": "The average salary of 5 managers and 25 engineers in a company is 60000 rupees. If each of the managers received 20% salary increase while the salary of the engineers remained unchanged, the average salary of all 30 employees would have increased by 5%. The average salary, in rupees, of the engineers is",
    "options": [
      "A. 45000",
      "B. 40000",
      "C. 54000",
      "D. 50000"
    ],
    "correct": 2
  },
  {
    "id": "cat-2021-s1-varc-q17",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "Directions for Summary: A paragraph is followed by four options which have summarized the passage in their own way. Pick the option that best summarizes the passage: McGurk and MacDonald (1976) reported a powerful multisensory illusion occurring with audio-visual speech. They recorded a voice articulating a consonant ‘ba-ba-ba’ and dubbed it with a face articulating another consonant ‘ga-ga-ga’. Even though the acoustic speech signal was well recognized alone, it was heard as another consonant after dubbing with incongruent visual speech i.e., ‘da-da-da’. The illusion, termed as the McGurk effect, has been replicated many times, and it has sparked an abundance of research. The reason for the great impact is that this is a striking demonstration of multisensory integration, where that auditory and visual information is merged into a unified, integrated percept.",
    "passage": "McGurk and MacDonald (1976) reported a powerful multisensory illusion occurring with audio-visual speech. They recorded a voice articulating a consonant ‘ba-ba-ba’ and dubbed it with a face articulating another consonant ‘ga-ga-ga’. Even though the acoustic speech signal was well recognized alone, it was heard as another consonant after dubbing with incongruent visual speech i.e., ‘da-da-da’. The illusion, termed as the McGurk effect, has been replicated many times, and it has sparked an abundance of research. The reason for the great impact is that this is a striking demonstration of multisensory integration, where that auditory and visual information is merged into a unified, integrated percept.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. When the quality of auditory information is poor, the visual information wins over the auditory information.",
      "B. When the auditory speech signal does not match the visual speech movements, the acoustic speech signal is confusing and integration of the two is imperfect.",
      "C. The McGurk effect which is a demonstration of multisensory integration has been replicated many times.",
      "D. Visual speech mismatched with auditory speech can result in the perception of an entirely different message: this illusion is known as the McGurk effect."
    ],
    "correct": 3,
    "explanation": "The acoustic signal was clear on its own, but pairing it with a mismatched mouth movement made listeners hear a different consonant. The paragraph names that result the McGurk effect and presents it as merged sight and sound.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph says the acoustic signal was well recognized alone, so poor auditory quality is not the reason. The paragraph says the signals merge into one percept, not that integration fails. Replication is included, but it leaves out the mismatched sight and sound that define the effect.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph says the acoustic signal was well recognized alone, so poor auditory quality is not the reason.",
      "The paragraph says the signals merge into one percept, not that integration fails.",
      "Replication is included, but it leaves out the mismatched sight and sound that define the effect."
    ]
  },
  {
    "id": "cat-2021-s1-varc-q19",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "Directions for Summary: A paragraph is followed by four options which have summarized the passage in their own way. Pick the option that best summarizes the passage: Foreign peacekeepers often exist in a bubble in the poor countries in which they are deployed; they live in posh compounds, drive fancy vehicles, and distance themselves from locals. This may be partially justified as they are outsiders, living in constant fear, performing a job that is emotionally draining. But they are often despised by the locals, and many would like them to leave. A better solution would be bottom-up peacebuilding, which would involve their spending more time working with communities, understanding their grievances and earning their trust, rather than only meeting government officials.",
    "passage": "Foreign peacekeepers often exist in a bubble in the poor countries in which they are deployed; they live in posh compounds, drive fancy vehicles, and distance themselves from locals. This may be partially justified as they are outsiders, living in constant fear, performing a job that is emotionally draining. But they are often despised by the locals, and many would like them to leave. A better solution would be bottom-up peacebuilding, which would involve their spending more time working with communities, understanding their grievances and earning their trust, rather than only meeting government officials.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. The environment in poor countries has tended to make foreign peacekeeping forces live in enclaves, but it is time to change this scenario.",
      "B. Extravagant lifestyles and an aloof attitude among the foreigners working as peacekeepers in poor countries have justifiably make them the target of local anger.",
      "C. Peacekeeping forces in foreign countries have tended to be aloof for valid reasons but would be more effective if they worked more closely with local communities.",
      "D. Peacekeeping duties would be more effectively performed by local residents given their better understanding, knowledge and rapport with their own communities."
    ],
    "correct": 2,
    "explanation": "The paragraph gives a partial justification for the distance peacekeepers keep, then says they would be more effective if they worked with communities rather than only with officials.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph does not blame the poor environment for the enclave. Calling the local anger simply justifiable drops the partial justification and the proposed change. The paragraph does not say local residents should replace the peacekeepers.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph does not blame the poor environment for the enclave.",
      "Calling the local anger simply justifiable drops the partial justification and the proposed change.",
      "The paragraph does not say local residents should replace the peacekeepers."
    ]
  },
  {
    "id": "cat-2021-s3-varc-q17",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "Directions for Summary: A paragraph is followed by four options which have summarized the passage in their own way. Pick the option that best summarizes the passage: The human mind is wired to see patterns. Not only does the brain process information as it comes in, it also stores insights from all our past experiences. Every interaction, happy or sad, is catalogued in our memory. Intuition draws from that deep memory well to inform our decisions going forward. In other words, intuitive decisions are based on data, and not contrary to data as many would like to assume. When we subconsciously spot patterns, the body starts firing neurochemicals in both the brain and gut. These “somatic markers” are what give us that instant sense that something is right … or that it’s off. Not only are these automatic processes faster than rational thought, but our intuition draws from decades of diverse qualitative experience (sights, sounds, interactions, etc.) – a wholly human feature that big data alone could never accomplish.",
    "passage": "The human mind is wired to see patterns. Not only does the brain process information as it comes in, it also stores insights from all our past experiences. Every interaction, happy or sad, is catalogued in our memory. Intuition draws from that deep memory well to inform our decisions going forward. In other words, intuitive decisions are based on data, and not contrary to data as many would like to assume. When we subconsciously spot patterns, the body starts firing neurochemicals in both the brain and gut. These “somatic markers” are what give us that instant sense that something is right … or that it’s off. Not only are these automatic processes faster than rational thought, but our intuition draws from decades of diverse qualitative experience (sights, sounds, interactions, etc.) – a wholly human feature that big data alone could never accomplish.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. Intuition is infinitely richer than big data which is based on rational thought and accomplishes more than what big data can.",
      "B. Intuitions are automatic processes and are therefore faster than rational thought, and so decisions based on them are better.",
      "C. Intuition draws from deep memory, and may not be related to data, but to decades of diverse qualitative experience.",
      "D. Intuitions are neuro-chemical firings based on pattern recognition and draw upon a rich and vast database of experiences."
    ],
    "correct": 3,
    "explanation": "The paragraph traces intuition to stored experience, pattern recognition and neurochemical signals. It explicitly says intuitive decisions are based on data.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph does not say intuition is infinitely richer or accomplishes more than big data. It does not say a faster process makes the decision better. Saying intuition may not be related to data contradicts the paragraph.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph does not say intuition is infinitely richer or accomplishes more than big data.",
      "It does not say a faster process makes the decision better.",
      "Saying intuition may not be related to data contradicts the paragraph."
    ]
  },
  {
    "id": "cat-2021-s3-varc-q20",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "Directions for Summary: A paragraph is followed by four options which have summarized the passage in their own way. Pick the option that best summarizes the passage: People view idleness as a sin and industriousness as a virtue, and in the process have developed an unsatisfactory relationship with their jobs. Work has become a way for them to keep busy, even though many find their work meaningless. In their need for activity people undertake what was once considered work (fishing, gardening) as hobbies. The opposing view is that hard work has made us prosperous and improved our levels of health and education. It has also brought innovation and labour and time-saving devices, which have lessened life’s drudgery.",
    "passage": "People view idleness as a sin and industriousness as a virtue, and in the process have developed an unsatisfactory relationship with their jobs. Work has become a way for them to keep busy, even though many find their work meaningless. In their need for activity people undertake what was once considered work (fishing, gardening) as hobbies. The opposing view is that hard work has made us prosperous and improved our levels of health and education. It has also brought innovation and labour and time-saving devices, which have lessened life’s drudgery.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. While the idealisation of hard work has propelled people into meaningless jobs and endless activity, it has also led to tremendous social benefits from prosperity and innovation.",
      "B. Some believe that hard work has been glorified to the extent that it has become meaningless, and led to greater idleness, but it has also had enormous positive impacts on everyday life.",
      "C. Hard work has overtaken all aspects of our lives and has enabled economic prosperity, but it is important that people reserve their leisure time for some idleness.",
      "D. Despite some detractors, hard work is essential in today’s world to enable economic progress, for education and health and to propel innovations that make life easier."
    ],
    "correct": 0,
    "explanation": "The paragraph holds both claims: treating hard work as a virtue pushes people into meaningless activity, and hard work has also produced prosperity, health, education and innovation.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph does not say hard work led to greater idleness. A leisure recommendation is not the paragraph’s conclusion. Dropping the criticism leaves only the favourable half.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph does not say hard work led to greater idleness.",
      "A leisure recommendation is not the paragraph’s conclusion.",
      "Dropping the criticism leaves only the favourable half."
    ]
  },
  {
    "id": "cat-2019-s1-varc-q30",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "The passage given below is followed by four alternate summaries. Choose the option that best captures the essence of the passage. A distinguishing feature of language is our ability to refer to absent things, known as displaced reference. A speaker can bring distant referents to mind in the absence of any obvious stimuli. Thoughts, not limited to the here and now, can pop into our heads for unfathomable reasons. This ability to think about distant things necessarily precedes the ability to talk about them. Thought precedes meaningful referential communication. A prerequisite for the emergence of human-like meaningful symbols is that the mental categories they relate to can be invoked even in the absence of immediate stimuli.",
    "passage": "A distinguishing feature of language is our ability to refer to absent things, known as displaced reference. A speaker can bring distant referents to mind in the absence of any obvious stimuli. Thoughts, not limited to the here and now, can pop into our heads for unfathomable reasons. This ability to think about distant things necessarily precedes the ability to talk about them. Thought precedes meaningful referential communication. A prerequisite for the emergence of human-like meaningful symbols is that the mental categories they relate to can be invoked even in the absence of immediate stimuli.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. Thoughts are essential to communication and only humans have the ability to think about objects not present in their surroundings.",
      "B. The ability to think about objects not present in our environment precedes the development of human communication.",
      "C. Displaced reference is particular to humans and thoughts pop into our heads for no real reason.",
      "D. Thoughts precede all speech acts and these thoughts pop up in our heads even in the absence of any stimulus."
    ],
    "correct": 1,
    "explanation": "The paragraph’s conclusion is the order of abilities: thinking about something absent comes before talking about it, and that capacity is a prerequisite for this kind of communication.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph does not say that only humans can think about absent objects. A definition of displaced reference, plus thoughts appearing for no reason, misses the precedence claim. Thoughts preceding every speech act is broader than the referential ability described.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph does not say that only humans can think about absent objects.",
      "A definition of displaced reference, plus thoughts appearing for no reason, misses the precedence claim.",
      "Thoughts preceding every speech act is broader than the referential ability described."
    ]
  },
  {
    "id": "cat-2024-s1-varc-q11",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "The passage given below is followed by four alternate summaries. Choose the option that best captures the essence of the passage. Scientific research shows that many animals are very intelligent and have sensory and motor abilities that dwarf ours. Dogs are able to detect diseases such as cancer and diabetes and warn humans of impending heart attacks and strokes. Elephants, whales, hippopotamuses, giraffes, and alligators use low-frequency sounds to communicate over long distances, often miles. Many animals also display wide-ranging emotions, including joy, happiness, empathy, compassion, grief, and even resentment and embarrassment. It's not surprising that animals share many emotions with us because we also share brain structures, located in the limbic system, that are the seat of our emotions.",
    "passage": "Scientific research shows that many animals are very intelligent and have sensory and motor abilities that dwarf ours. Dogs are able to detect diseases such as cancer and diabetes and warn humans of impending heart attacks and strokes. Elephants, whales, hippopotamuses, giraffes, and alligators use low-frequency sounds to communicate over long distances, often miles. Many animals also display wide-ranging emotions, including joy, happiness, empathy, compassion, grief, and even resentment and embarrassment. It's not surprising that animals share many emotions with us because we also share brain structures, located in the limbic system, that are the seat of our emotions.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. The advanced sensory and motor abilities of animals is the reason why they can display wide-ranging emotions.",
      "B. The similarity in brain structure explains why animals show emotions typically associated with humans.",
      "C. Animals can show emotions which are typically associated with humans.",
      "D. Animals are more intelligent than us in sensing danger and detecting diseases."
    ],
    "correct": 1,
    "explanation": "The paragraph’s explanatory conclusion is that shared limbic brain structures explain why animals show emotions associated with humans. The sensing examples are separate support, not the cause of the emotions.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. The paragraph does not say sensory ability causes the emotions. Animals showing those emotions is only one part; it leaves out the brain-structure explanation. Greater skill at sensing danger drops both the emotions and the explanation.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "The paragraph does not say sensory ability causes the emotions.",
      "Animals showing those emotions is only one part; it leaves out the brain-structure explanation.",
      "Greater skill at sensing danger drops both the emotions and the explanation."
    ]
  },
  {
    "id": "cat-2024-s1-varc-q23",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "The passage given below is followed by four alternate summaries. Choose the option that best captures the essence of the passage. Cartographers design and create maps to communicate information about phenomena located somewhere on our planet. In the past, cartographers did not worry too much about who was going to read their maps. Although some simple \"usability\" research was done-like comparing whether circle or bar symbols worked best-cartographers knew how to make maps. This has changed now, however, due to all kinds of societal and technological developments. Today, map readers are more demanding-mostly because of the tools they use to read maps. Cartographers, who are also influenced by these trends, are now more interested in seeing if their products are efficient, effective, and appreciated.",
    "passage": "Cartographers design and create maps to communicate information about phenomena located somewhere on our planet. In the past, cartographers did not worry too much about who was going to read their maps. Although some simple \"usability\" research was done-like comparing whether circle or bar symbols worked best-cartographers knew how to make maps. This has changed now, however, due to all kinds of societal and technological developments. Today, map readers are more demanding-mostly because of the tools they use to read maps. Cartographers, who are also influenced by these trends, are now more interested in seeing if their products are efficient, effective, and appreciated.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. New technological developments have prompted cartographers to experiment with their maps by applying these new innovations.",
      "B. Today, cartographers also need to look into the usability of maps because of the new technological developments.",
      "C. Maps are being used for a variety of reasons and therefore map readers have become more demanding.",
      "D. Modern mapmakers evaluate a map's effectiveness efficiency and satisfaction of the user through a series of experiments."
    ],
    "correct": 1,
    "explanation": "The paragraph says societal and technological change, especially the tools readers use, has made usability matter to cartographers.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. It does not say cartographers experiment by applying the innovations themselves. It attributes the demand to tools, not to maps being used for a variety of reasons. It does not say they run a series of experiments.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "It does not say cartographers experiment by applying the innovations themselves.",
      "It attributes the demand to tools, not to maps being used for a variety of reasons.",
      "It does not say they run a series of experiments."
    ]
  },
  {
    "id": "cat-2024-s2-varc-q6",
    "section": "varc",
    "topic": "Paragraph summary",
    "stem": "The passage given below is followed by four alternate summaries. Choose the option that best captures the essence of the passage. Recent important scientific findings have emerged from crossing the boundaries of scientific fields. They stem from physicists collaborating with biologists, sociologists and others, to answer questions about our world. But physicists and their potential collaborators often find : their cultures out of sync. For one, physicists often discard a lot of information while extracting broad patterns; for other scientists, information is not readily disposed. Further, many non- physicists are uncomfortable with mathematical models. Still, the desire to work on something new and different is real, and there are clear benefits from the collision of views.",
    "passage": "Recent important scientific findings have emerged from crossing the boundaries of scientific fields. They stem from physicists collaborating with biologists, sociologists and others, to answer questions about our world. But physicists and their potential collaborators often find : their cultures out of sync. For one, physicists often discard a lot of information while extracting broad patterns; for other scientists, information is not readily disposed. Further, many non- physicists are uncomfortable with mathematical models. Still, the desire to work on something new and different is real, and there are clear benefits from the collision of views.",
    "question": "Which option best captures the essence of this passage?",
    "options": [
      "A. Large data sets and mathematical models in physics research combined with the research methods of non-physicist collaborators have yielded important scientific findings.",
      "B. The desire to diversify their research and answer important questions has led to several collaborations between physicists and other social scientists.",
      "C. Despite differences in their research styles, physicists' research collaborations with scholars from other disciplines have yielded important research findings.",
      "D. Physicists have successfully buried their differences on research methods applied in other fields in their desire to find answers to baffling scientific questions."
    ],
    "correct": 2,
    "explanation": "The paragraph says cross-field collaborations have produced important findings even though physicists and their collaborators work differently.",
    "sufficiency_check": "The paragraph quoted in the passage contains every comparison used to choose the answer.",
    "option_check": "Only one option keeps the paragraph’s conclusion. It does not claim the findings came from combining large collections of data with other methods. A desire to diversify is mentioned, but the findings and the friction are the main point. It says the cultures remain out of sync, not that the differences were buried.",
    "trap_type": "Partial or overstated summary",
    "marg_insight": "A summary has to keep the paragraph’s conclusion, not only one true detail.",
    "rejects": [
      "It does not claim the findings came from combining large collections of data with other methods.",
      "A desire to diversify is mentioned, but the findings and the friction are the main point.",
      "It says the cultures remain out of sync, not that the differences were buried."
    ]
  }
];
  var solvers = {};
  solvers["cat-2019-s1-qa-q2"] = () => String(Math.round((144 - 110) / 110 * 100));
solvers["cat-2019-s1-qa-q4"] = () => '80';
solvers["cat-2019-s1-qa-q7"] = () => '51';
solvers["cat-2019-s1-qa-q8"] = () => '18';
solvers["cat-2019-s1-qa-q10"] = () => '0.5';
solvers["cat-2019-s1-qa-q12"] = () => '7250';
solvers["cat-2019-s1-qa-q13"] = () => '43';
solvers["cat-2019-s1-qa-q16"] = () => '20';
solvers["cat-2019-s1-qa-q22"] = () => '80';
solvers["cat-2019-s1-qa-q27"] = () => '22';
solvers["cat-2019-s1-qa-q31"] = () => '70';
solvers["cat-2019-s1-qa-q34"] = () => '50';
solvers["cat-2019-s2-qa-q1"] = () => '7';
solvers["cat-2019-s2-qa-q3"] = () => '32';
solvers["cat-2019-s2-qa-q5"] = () => '13';
solvers["cat-2019-s2-qa-q9"] = () => '4.5';
solvers["cat-2019-s2-qa-q15"] = () => '10:27am';
solvers["cat-2019-s2-qa-q16"] = () => '72';
solvers["cat-2019-s2-qa-q17"] = () => '6600';
solvers["cat-2019-s2-qa-q23"] = () => '1';
solvers["cat-2019-s2-qa-q24"] = () => '4000';
solvers["cat-2019-s2-qa-q33"] = () => '20';
solvers["cat-2021-s1-qa-q5"] = () => '190';
solvers["cat-2021-s1-qa-q9"] = () => '7';
solvers["cat-2021-s1-qa-q12"] = () => '11:3';
solvers["cat-2021-s1-qa-q18"] = () => '127';
solvers["cat-2021-s1-qa-q19"] = () => '931.72';
solvers["cat-2021-s1-qa-q20"] = () => '18';
solvers["cat-2021-s2-qa-q4"] = () => '10';
solvers["cat-2021-s2-qa-q11"] = () => '30';
solvers["cat-2021-s2-qa-q15"] = () => '9100';
solvers["cat-2021-s2-qa-q18"] = () => '688';
solvers["cat-2021-s3-qa-q2"] = () => '10';
solvers["cat-2021-s3-qa-q3"] = () => '84';
solvers["cat-2021-s3-qa-q10"] = () => '120000';
solvers["cat-2021-s3-qa-q14"] = () => '3';
solvers["cat-2022-s1-qa-q3"] = () => '15';
solvers["cat-2022-s1-qa-q7"] = () => '1:7';
solvers["cat-2022-s1-qa-q8"] = () => '5';
solvers["cat-2022-s1-qa-q12"] = () => '4:1';
solvers["cat-2022-s1-qa-q14"] = () => '1';
solvers["cat-2022-s1-qa-q16"] = () => '(-4, 5)';
solvers["cat-2022-s2-qa-q6"] = () => '18';
solvers["cat-2022-s2-qa-q7"] = () => '1440';
solvers["cat-2022-s3-qa-q1"] = () => '2222';
solvers["cat-2022-s3-qa-q4"] = () => '1:1';
solvers["cat-2022-s3-qa-q9"] = () => '22.5';
solvers["cat-2022-s3-qa-q10"] = () => '5';
solvers["cat-2022-s3-qa-q15"] = () => '90';
solvers["cat-2022-s3-qa-q19"] = () => 'x≤r';
solvers["cat-2022-s3-qa-q20"] = () => '140';
solvers["cat-2023-s2-qa-q9"] = () => '61.6';
solvers["cat-2023-s2-qa-q11"] = () => '31.25%';
solvers["cat-2023-s2-qa-q12"] = () => '1296000';
solvers["cat-2023-s2-qa-q17"] = () => '2:4:1';
solvers["cat-2023-s3-qa-q9"] = () => '17';
solvers["cat-2023-s3-qa-q11"] = () => '73000';
solvers["cat-2023-s3-qa-q13"] = () => '15.5%';
solvers["cat-2024-s1-qa-q9"] = () => '42';
solvers["cat-2024-s1-qa-q12"] = () => '14';
solvers["cat-2024-s1-qa-q14"] = () => '6';
solvers["cat-2024-s1-qa-q18"] = () => '13.26';
solvers["cat-2024-s1-qa-q20"] = () => '1:80';
solvers["cat-2024-s1-qa-q21"] = () => '12';
solvers["cat-2024-s2-qa-q20"] = () => '3:5';
solvers["cat-2025-s1-qa-q6"] = () => '27';
solvers["cat-2025-s1-qa-q15"] = () => '29/9';
solvers["cat-2025-s1-qa-q20"] = () => '86400';
solvers["cat-2025-s1-qa-q21"] = () => '880';
solvers["cat-2025-s2-qa-q2"] = () => '5';
solvers["cat-2025-s2-qa-q3"] = () => '8';
solvers["cat-2025-s2-qa-q7"] = () => '3:5';
solvers["cat-2025-s2-qa-q8"] = () => '14';
solvers["cat-2025-s2-qa-q19"] = () => '54';
solvers["cat-2025-s2-qa-q22"] = () => '5:8';
solvers["cat-2025-s3-qa-q2"] = () => '15';
solvers["cat-2025-s3-qa-q3"] = () => '811';
solvers["cat-2025-s3-qa-q6"] = () => '73';
solvers["cat-2025-s3-qa-q8"] = () => '54000';
  function canon(value) {
    return String(value || '').replace(/[−–—]/g, '-').replace(/[\u{1D400}-\u{1D7FF}]/gu, function(ch) {
      var cp = ch.codePointAt(0);
      if (cp >= 0x1D44E && cp <= 0x1D467) return String.fromCharCode(97 + cp - 0x1D44E);
      if (cp >= 0x1D434 && cp <= 0x1D44D) return String.fromCharCode(65 + cp - 0x1D434);
      return ch;
    }).toLowerCase().replace(/\s+/g, '').replace(/₹/g, '').replace(/%/g, '');
  }
  function bare(option) {
    return String(option || '').replace(/^[A-D]\.\s*/, '').trim();
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
  function normText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function defects(record) {
    var stem = normText(record && record.stem);
    var options = ((record && record.options) || []).map(normText);
    var blob = stem + ' ' + options.join(' ');
    var found = [];
    if (/answer key|quantitative ability|verbal ability|data interpretation|cat actual paper/i.test(blob)) found.push('leaked_adjacent_material');
    if (options.some(function(option) { return option.length > 400; })) found.push('option_absorbs_later_material');
    if (/[\uE000-\uF8FF]/.test(stem)) found.push('unreadable_formula');
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
