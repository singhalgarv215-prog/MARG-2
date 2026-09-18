/* Original parameterised QA. Numeric validity is checked by a separate solver.
 * This is a bounded practice generator, not a claim of complete CAT coverage. */
var MargQAEngine = (function () {
  'use strict';
  var topics=['Percentages','Ratios & Proportions','Time-Speed-Distance','Profit & Loss','Linear Equations','Quadratic Equations','Functions & Inequalities','Logarithms & Exponents','Geometry (Triangles, Circles)','Mensuration (2D & 3D)','Coordinate Geometry','Number Systems','Permutation & Combination','Probability','Set Theory'];
  function rng(seed){var s=seed>>>0;return function(n){s=(Math.imul(s,1664525)+1013904223)>>>0;return s%n;};}
  function fmt(v){if(Math.abs(v-Math.round(v))<1e-8)return String(Math.round(v));for(var d=2;d<=10000;d++){var n=Math.round(v*d);if(Math.abs(v-n/d)<1e-10)return n+'/'+d;}return String(Math.round(v*1000000)/1000000);}
  function choose(n,k){if(k<0||k>n)return 0;var a=1;for(var i=1;i<=k;i++)a=a*(n-i+1)/i;return Math.round(a);}
  function fact(n){var a=1;for(var i=2;i<=n;i++)a*=i;return a;}
  function make(topic,k,p){
    var a=p[0],b=p[1],c=p[2],q,v,w,insight;
    switch(topics.indexOf(topic)){
    case 0:
      if(k===0){q='A class has '+(a*10)+' students. '+(a*4)+' are women. After '+(b*10)+' men join and nobody leaves, what percentage of the class consists of women?';v=40*a/(a+b);w='Women remain '+(a*4)+'. New total = '+((a+b)*10)+'. Percentage = '+(a*4)+' / '+((a+b)*10)+' × 100 = '+fmt(v)+'.';insight='Track the unchanged count before changing the percentage base.';}
      if(k===1){q='A shop raises a price by '+(a*5)+'% and then reduces the new price by '+(b*5)+'%. The final price is Rs. '+((20+a)*(20-b)*c)+'. What was the original price in rupees?';v=400*c;w='Final multiplier = '+(1+a/20)+' × '+(1-b/20)+'. Divide the stated final price by this product to get '+v+'.';insight='Successive percentages act on different bases.';}
      if(k===2){q='An alloy of '+(10*a)+' kg contains 30% copper. How many kg of pure copper must be added to make the resulting alloy 50% copper?';v=4*a;w='If x kg is added, copper = '+(3*a)+' + x and total = '+(10*a)+' + x. Set copper to half the total: x = '+v+'.';insight='Conserve the original metal while the denominator grows.';}
      break;
    case 1:
      if(k===0){q='A and B share Rs. '+(120*a)+' in the ratio 2:3. B gives one fourth of B’s initial share to A. What is A’s final share in rupees?';v=66*a;w='A initially gets '+(48*a)+' and B gets '+(72*a)+'. The transfer is '+(18*a)+', so A finishes with '+v+'.';insight='Apply the fraction to the correct person’s share.';}
      if(k===1){q='The present ages of two siblings are in the ratio 3:5. After '+(2*a)+' years, their ages will be in the ratio 2:3. What is their present age difference in years?';v=4*a;w='Write ages as 3x and 5x. 3(3x + '+(2*a)+') = 2(5x + '+(2*a)+'), giving x = '+(2*a)+'. Difference = 2x = '+v+'.';insight='Add the same years to ages, not to ratio terms.';}
      if(k===2){q='Three partners invest in the ratio 2:3:4 for '+a+', '+(a+1)+' and '+(a+2)+' months respectively. They share Rs. '+(100*(9*a+11))+' proportional to capital × time. What is the second partner’s share in rupees?';v=300*(a+1);w='Profit weights are '+(2*a)+', '+(3*(a+1))+' and '+(4*(a+2))+'. Total weight = '+(9*a+11)+'. Each weight unit receives Rs. 100; second share = '+v+'.';insight='Duration changes the profit ratio.';}
      break;
    case 2:
      if(k===0){q='A car covers two equal-distance legs at '+(10*a)+' and '+(10*(a+2))+' km/h. What is its average speed over the whole trip in km/h?';v=10*a*(a+2)/(a+1);w='For distance d each, total time = d/'+(10*a)+' + d/'+(10*(a+2))+'. Divide 2d by this time: average = '+fmt(v)+'.';insight='Equal distances require a harmonic, not arithmetic, average.';}
      if(k===1){q='Two cyclists start '+(12*a*b)+' km apart and ride towards each other at '+(3*a)+' and '+(3*b)+' km/h. How far does the faster cyclist travel before they meet, in km?';v=12*a*b*Math.max(a,b)/(a+b);w='Meeting time = '+(12*a*b)+' / '+(3*(a+b))+'. Multiply by faster speed '+(3*Math.max(a,b))+' to get '+fmt(v)+'.';insight='Use closing speed to find the shared meeting time.';}
      if(k===2){q='A boat’s still-water speed is '+(3*a)+' km/h and the stream speed is '+a+' km/h. It travels '+(8*a*b)+' km upstream and returns the same distance. What is the total time in hours?';v=6*b;w='Upstream speed = '+(2*a)+'; downstream = '+(4*a)+'. Times are '+(4*b)+' and '+(2*b)+' hours, totaling '+v+'.';insight='Compute each travel time before adding.';}
      break;
    case 3:
      if(k===0){q='A seller marks an item '+(a*10)+'% above its cost, then gives a 20% discount. The selling price is Rs. '+(80*(10+a)*b)+'. What is the profit in rupees?';v=100*b*(.8*(10+a)-10);w='Cost = '+(1000*b)+', since selling multiplier is '+fmt(.8*(1+a/10))+'. Profit = selling price − cost = '+fmt(v)+'.';insight='Markup and discount have different bases.';}
      if(k===1){q='A trader buys '+(10*a)+' identical items for Rs. '+(1000*a)+'. Two items are damaged and cannot be sold. At what price per remaining item, in rupees, must the trader sell to earn 20% profit on the total purchase?';v=1200*a/(10*a-2);w='Required revenue = '+(1200*a)+'. Only '+(10*a-2)+' items are saleable. Divide required revenue by saleable items: '+fmt(v)+'.';insight='Include the cost of damaged stock in the profit base.';}
      if(k===2){q='An item costs Rs. '+(1000*a)+'. A seller offers successive discounts of 10% and 20% on the marked price and still earns 8% profit. What must the marked price be, in rupees?';v=1500*a;w='Required sale price = '+(1080*a)+'. Discounts retain 0.9 × 0.8 = 0.72 of the mark. Mark = '+(1080*a)+' / 0.72 = '+v+'.';insight='Work backwards from the required sale price.';}
      break;
    case 4:
      if(k===0){q='A cashier has '+(a+b)+' coins, each worth either Rs. 2 or Rs. 5. Their total value is Rs. '+(2*a+5*b)+'. How many Rs. 5 coins are there?';v=b;w='Let x be the Rs. 5 count. Then 5x + 2('+ (a+b)+' − x) = '+(2*a+5*b)+'. Solving the linear equation gives x = '+b+'.';insight='Use the count equation to remove one variable.';}
      if(k===1){q='A theatre sells '+(10*(a+b))+' tickets. Adult tickets cost Rs. 200 and student tickets Rs. 120. The collection is Rs. '+(2000*a+1200*b)+'. How many adult tickets were sold?';v=10*a;w='Use the linear count and value equations. If all tickets were student tickets, collection would be '+(1200*(a+b))+'. Extra collection = '+(800*a)+'; each adult adds Rs. 80. Adult count = '+v+'.';insight='An all-one-type baseline turns two equations into one.';}
      if(k===2){q='Positive integers x and y satisfy the simultaneous linear equations 3x + 2y = '+(3*a+2*b)+' and 2x + 3y = '+(2*a+3*b)+'. What is x − y?';v=a-b;w='Subtract the second equation from the first: x − y = '+(3*a+2*b)+' − '+(2*a+3*b)+' = '+v+'.';insight='Solve only the requested expression, not every variable.';}
      break;
    case 5:
      if(k===0){q='The quadratic equation x² − '+(a+b)+'x + '+(a*b)+' = 0 has roots r and s. What is r² + s²?';v=a*a+b*b;w='Root sum = '+(a+b)+' and product = '+(a*b)+'. r² + s² = (r+s)² − 2rs = '+v+'.';insight='Use root relations before computing separate roots.';}
      if(k===1){q='For what positive value of t does the quadratic equation x² − '+(2*a)+'x + t = 0 have equal real roots?';v=a*a;w='Equal roots require discriminant zero: '+(4*a*a)+' − 4t = 0, so t = '+v+'.';insight='Translate the root condition into a discriminant constraint.';}
      if(k===2){q='How many integers x satisfy the quadratic inequality x² − '+(2*a+b)+'x + '+(a*(a+b))+' < 0?';v=b-1;w='Factor as (x − '+a+')(x − '+(a+b)+') < 0. Thus '+a+' < x < '+(a+b)+', containing '+v+' integers.';insight='Strict endpoints are not included.';}
      break;
    case 6:
      if(k===0){q='For the function f(x) = |x − '+a+'| + |x − '+(a+b)+'|, how many integers x attain its minimum value?';v=b+1;w='Between '+a+' and '+(a+b)+', the two distances sum to '+b+'. Outside, the sum grows. The interval includes '+v+' integers.';insight='Absolute values are distances; the minimum can be an interval.';}
      if(k===1){q='How many integers x satisfy the rational inequality (x − '+a+') / (x − '+(a+b)+') < 0?';v=b-1;w='The numerator and denominator have opposite signs only when '+a+' < x < '+(a+b)+'. The pole and zero are excluded; count = '+v+'.';insight='Do not multiply an inequality by a denominator of unknown sign.';}
      if(k===2){q='The function f(x) = x² − '+(2*a)+'x + '+(a*a+b)+' is defined for real x. What is the minimum value of f(x) + f(x + 2)?';v=2*b+2;w='f(x) = (x − '+a+')² + '+b+'. Put u = x − '+(a-1)+'. The sum is 2u² + '+(2*b+2)+', minimized at u = 0.';insight='Complete the square after combining both function values.';}
      break;
    case 7:
      if(k===0){q='For x > '+a+', log base 2 of (x − '+a+') plus log base 2 of (x + '+a+') equals '+(2*b)+'. What is x²?';v=a*a+Math.pow(2,2*b);w='Combine logs: log₂(x² − '+(a*a)+') = '+(2*b)+'. Hence x² − '+(a*a)+' = '+Math.pow(2,2*b)+' and x² = '+v+'.';insight='Apply the log domain before accepting a root.';}
      if(k===1){q='If 2^(x+1) + 2^x = '+(3*Math.pow(2,a))+', what is 4^x?';v=Math.pow(4,a);w='Factor 2^x: 3 × 2^x = '+(3*Math.pow(2,a))+'. Therefore x = '+a+' and 4^x = '+v+'.';insight='Factor the common exponential instead of taking logs immediately.';}
      if(k===2){q='Positive x and y satisfy log base 2 of x + log base 2 of y = '+(a+b)+' and log base 2 of x − log base 2 of y = '+(a-b)+'. What is x + y?';v=Math.pow(2,a)+Math.pow(2,b);w='Add and subtract the log equations to get log₂x = '+a+' and log₂y = '+b+'. Thus x + y = '+v+'.';insight='Treat the logarithms as the unknowns first.';}
      break;
    case 8:
      if(k===0){q='A right triangle has perpendicular sides '+(3*a)+' and '+(4*a)+' cm. What is the radius of its incircle in cm?';v=a;w='Hypotenuse = '+(5*a)+'. Area = '+(6*a*a)+' and semiperimeter = '+(6*a)+'. Inradius = area / semiperimeter = '+a+'.';insight='Combine Pythagoras with area = inradius × semiperimeter.';}
      if(k===1){q='In triangle ABC, DE is parallel to BC, with D on AB and E on AC. AD:DB = '+a+':'+b+'. The area of triangle ABC is '+((a+b)*(a+b)*c)+' cm². What is the area of quadrilateral DBCE in cm²?';v=((a+b)*(a+b)-a*a)*c;w='Similarity gives AD/AB = '+a+'/'+(a+b)+'. Triangle ADE area = '+(a*a*c)+'. Subtract from the whole area to obtain '+v+'.';insight='An area ratio is the square of the side ratio.';}
      if(k===2){q='A circle has radius '+(5*a)+' cm. A chord is '+(6*a)+' cm long. What is the perpendicular distance from the centre to the chord in cm?';v=4*a;w='The perpendicular bisects the chord, giving half-length '+(3*a)+'. Distance² = '+(25*a*a)+' − '+(9*a*a)+' = '+(16*a*a)+', so distance = '+v+'.';insight='Use half the chord, not its full length.';}
      break;
    case 9:
      if(k===0){q='A hollow cylinder has outer radius '+(a+2)+' cm, inner radius '+a+' cm and height '+b+' cm. What is its material volume divided by π, in cm³?';v=4*(a+1)*b;w='Subtract the inner cylinder: volume/π = (('+ (a+2)+')² − '+a+'²) × '+b+' = '+v+'.';insight='Subtract volumes with the same height.';}
      if(k===1){q='A cube is divided into '+a+' equal parts along each edge. Its entire outer surface area was painted before cutting. How many small cubes have exactly two painted faces?';v=12*(a-2);w='Exactly two painted faces occur on edges but not corners. There are 12 edges with '+(a-2)+' such cubes each, giving '+v+'.';insight='Exclude corners before counting edge cubes.';}
      if(k===2){q='A solid cylinder of radius '+a+' cm and height '+(3*b)+' cm is melted into cones, each of radius '+a+' cm and height '+b+' cm, with no loss. How many cones are formed?';v=9;w='Cylinder volume = '+(3*a*a*b)+'π. Each cone volume = '+fmt(a*a*b/3)+'π. Their ratio is 9.';insight='Conserve volume, not surface area.';}
      break;
    case 10:
      if(k===0){q='In the coordinate plane, A = (0, 0) and B = ('+(3*a)+', '+(3*b)+'). Point P divides AB internally in the ratio AP:PB = 1:2. What is the squared distance OP² from the origin?';v=a*a+b*b;w='P is one third of the way from A to B, so P = ('+a+', '+b+'). OP² = '+a+'² + '+b+'² = '+v+'.';insight='Read which segment comes first in the division ratio.';}
      if(k===1){q='Two lines in the coordinate plane have equations x + y = '+(a+b)+' and 2x − y = '+(2*a-b)+'. What is the squared distance of their intersection from the origin?';v=a*a+b*b;w='Add the equations: 3x = '+(3*a)+', hence x = '+a+' and y = '+b+'. Squared distance = '+v+'.';insight='Find the intersection before applying the distance formula.';}
      if(k===2){q='A triangle in the coordinate plane has vertices (0, 0), ('+(2*a)+', 0) and ('+b+', '+(2*c)+'). What is its area in square units?';v=2*a*c;w='The horizontal base is '+(2*a)+' and its perpendicular height is '+(2*c)+'. Area = ½ × base × height = '+v+'.';insight='The third point’s horizontal coordinate does not change this height.';}
      break;
    case 11:
      if(k===0){q='What is the smallest positive integer n that leaves remainder '+a+' when divided by 7 and remainder '+b+' when divided by 9?';for(v=1;v%7!==a||v%9!==b;v++){}w='Check n = '+a+' + 7t against the remainder modulo 9. The first positive candidate satisfying both conditions is '+v+'.';insight='Satisfy both congruences, not each separately.';}
      if(k===1){q='The integer N = 2^'+a+' × 3^'+b+' has how many positive divisors that are perfect squares?';v=(Math.floor(a/2)+1)*(Math.floor(b/2)+1);w='Square divisors have even exponents only. The choices are '+(Math.floor(a/2)+1)+' for 2 and '+(Math.floor(b/2)+1)+' for 3. Multiply to get '+v+'.';insight='Restrict prime exponents before counting divisors.';}
      if(k===2){q='How many trailing zeroes are there in '+(10*a)+' factorial?';v=Math.floor(10*a/5)+Math.floor(10*a/25);w='Count factors of 5: floor('+10*a+'/5) + floor('+10*a+'/25) = '+v+'. Higher powers contribute zero.';insight='Multiples of 25 contribute an extra factor of 5.';}
      break;
    case 12:
      if(k===0){q='There are '+a+' distinct books including A and B. In how many linear arrangements are A and B adjacent?';v=2*fact(a-1);w='Treat A and B as one block: '+(a-1)+' objects can be ordered in '+fact(a-1)+' ways. The block has two internal orders, giving '+v+'.';insight='Count internal order as well as block order.';}
      if(k===1){q='A committee of three is chosen from '+a+' women and '+b+' men, all distinct. How many committees contain exactly two women?';v=choose(a,2)*b;w='Choose 2 of '+a+' women and 1 of '+b+' men: '+choose(a,2)+' × '+b+' = '+v+'.';insight='A committee is a selection, not an ordering.';}
      if(k===2){q='A path goes from (0,0) to ('+a+','+b+') using only unit moves right or up. How many such paths do not pass through (1,1)?';v=choose(a+b,a)-2*choose(a+b-2,a-1);w='Use combinations of right-move positions: all paths = '+choose(a+b,a)+'. Paths through (1,1) = 2 × '+choose(a+b-2,a-1)+'. Subtract to obtain '+v+'.';insight='Count forbidden paths through the fixed point and subtract.';}
      break;
    case 13:
      if(k===0){q='A bag contains '+a+' red and '+b+' blue balls. Two balls are drawn uniformly without replacement. What is the probability that both are red?';v=a*(a-1)/((a+b)*(a+b-1));w='First red probability = '+a+'/'+(a+b)+'. After a red, second = '+(a-1)+'/'+(a+b-1)+'. Product = '+fmt(v)+'.';insight='Without replacement changes the second denominator.';}
      if(k===1){var low=a%4+2,total=0,fav=0;for(var die1=low;die1<=6;die1++)for(var die2=1;die2<=b;die2++)if((die1+die2)%2===0){total++;if(die1%2===1)fav++;}q='Two distinguishable fair six-sided dice are rolled. Given that the sum is even, the first die is at least '+low+' and the second die is at most '+b+', what is the probability that both dice show odd numbers?';v=fav/total;w='Count only the ordered outcomes satisfying all three conditions. There are '+total+' such outcomes, of which '+fav+' have two odd faces. Conditional probability = '+fmt(v)+'.';insight='Restrict the sample space before calculating a conditional probability.';}
      if(k===2){q='A fair coin is tossed '+a+' times independently. What is the probability of exactly two heads?';v=choose(a,2)/Math.pow(2,a);w='There are '+choose(a,2)+' choices for the two head positions among '+Math.pow(2,a)+' equally likely sequences. Probability = '+fmt(v)+'.';insight='Include all possible positions of the heads.';}
      break;
    case 14:
      if(k===0){q='Of '+(10*(a+b+c))+' students, '+(10*(a+c))+' study French and '+(10*(b+c))+' study German. Every student studies at least one of these two languages. How many study both?';v=10*c;w='Inclusion–exclusion: intersection = '+(10*(a+c))+' + '+(10*(b+c))+' − '+(10*(a+b+c))+' = '+v+'.';insight='Count an overlap once in the union.';}
      if(k===1){q='In a survey of three clubs, '+a+' people belong to X and Y, '+b+' to Y and Z, and '+c+' to X and Z. These pair counts include the '+Math.min(a,b,c-1)+' people in all three. How many people belong to exactly two clubs?';v=a+b+c-3*Math.min(a,b,c-1);w='Each pair count is an inclusive intersection. Subtract the triple overlap from each. Exactly two = '+a+' + '+b+' + '+c+' − 3 × '+Math.min(a,b,c-1)+' = '+v+'.';insight='The triple region appears in all three inclusive pair counts.';}
      if(k===2){q='A finite set A contains '+a+' elements. How many subsets of A contain a specified element P but do not contain another specified element Q, where P and Q are distinct elements of A?';v=Math.pow(2,a-2);w='P is forced in and Q forced out. Each of the remaining '+(a-2)+' elements has two independent choices, giving '+v+'.';insight='Remove forced membership decisions before counting subsets.';}
      break;
    default: throw new Error('Unsupported QA topic');
    }
    return {q:q,value:v,solution:w,insight:insight};
  }
  // Independent calculations from the visible construction parameters.
  function solve(s){var t=topics.indexOf(s.topic),k=s.kind,a=s.p[0],b=s.p[1],c=s.p[2],i,j,n=0;
    if(t===0)return k===0?(4*a)/((a+b)*10)*100:k===1?((20+a)*(20-b)*c)*20/(20+a)*20/(20-b):(5*a-3*a)/.5;
    if(t===1)return k===0?120*a*(2/5+3/20):k===1?2*(2*a):100*3*(a+1);
    if(t===2)return k===0?2/(1/(10*a)+1/(10*(a+2))):k===1?(12*a*b)/(3*a+3*b)*Math.max(3*a,3*b):(8*a*b)/(3*a-a)+(8*a*b)/(3*a+a);
    if(t===3)return k===0?80*(10+a)*b-1000*b:k===1?(1000*a)*1.2/(10*a-2):(1000*a)*1.08/(.9*.8);
    if(t===4){for(i=0;i<1000;i++){if(k===0&&5*i+2*(a+b-i)===2*a+5*b)return i;if(k===1&&200*i+120*(10*(a+b)-i)===2000*a+1200*b)return i;}if(k===2){for(i=1;i<30;i++)for(j=1;j<30;j++)if(3*i+2*j===3*a+2*b&&2*i+3*j===2*a+3*b)return i-j;}}
    if(t===5){if(k===0){var roots=[];for(i=-40;i<=40;i++)if(i*i-(a+b)*i+a*b===0)roots.push(i);return a===b?2*a*a:roots.reduce(function(x,r){return x+r*r;},0);}if(k===1)return Math.pow(2*a,2)/4;for(i=-40;i<=40;i++)if(i*i-(2*a+b)*i+a*(a+b)<0)n++;return n;}
    if(t===6){if(k===0){var min=Infinity;for(i=-50;i<=50;i++){var v=Math.abs(i-a)+Math.abs(i-a-b);if(v<min){min=v;n=1;}else if(v===min)n++;}return n;}if(k===1){for(i=-50;i<=50;i++)if(i!==a+b&&(i-a)/(i-a-b)<0)n++;return n;}var x=a-1;return (x*x-2*a*x+a*a+b)+((x+2)*(x+2)-2*a*(x+2)+a*a+b);}
    if(t===7)return k===0?Math.pow(Math.sqrt(Math.pow(2,2*b)+a*a),2):k===1?Math.pow((3*Math.pow(2,a))/3,2):Math.pow(2,((a+b)+(a-b))/2)+Math.pow(2,((a+b)-(a-b))/2);
    if(t===8)return k===0?(3*a+4*a-5*a)/2:k===1?(a+b)*(a+b)*c*(1-Math.pow(a/(a+b),2)):Math.sqrt((5*a)*(5*a)-(3*a)*(3*a));
    if(t===9)return k===0?b*(Math.pow(a+2,2)-a*a):k===1?12*a-24:Math.pow(a,2)*3*b/(Math.pow(a,2)*b/3);
    if(t===10)return k===0?Math.pow(3*a/3,2)+Math.pow(3*b/3,2):k===1?Math.pow(((a+b)+(2*a-b))/3,2)+Math.pow((a+b)-((a+b)+(2*a-b))/3,2):Math.abs(2*a*2*c)/2;
    if(t===11){if(k===0){for(i=1;i<=63;i++)if(i%7===a&&i%9===b)return i;}if(k===1){for(i=0;i<=a;i+=2)for(j=0;j<=b;j+=2)n++;return n;}for(i=1;i<=10*a;i++){j=i;while(j%5===0){n++;j/=5;}}return n;}
    if(t===12){if(k===0)return fact(a)-(a-1)*(a-2)*fact(a-2);if(k===1){for(i=0;i<a;i++)for(j=i+1;j<a;j++)n+=b;return n;}function paths(x,y,hit){if(x>a||y>b)return 0;hit=hit||(x===1&&y===1);if(x===a&&y===b)return hit?0:1;return paths(x+1,y,hit)+paths(x,y+1,hit);}return paths(0,0,false);}
    if(t===13){if(k===0){for(i=0;i<a;i++)for(j=0;j<a;j++)if(i!==j)n++;return n/((a+b)*(a+b-1));}if(k===1){var total=0;for(i=1;i<=6;i++)for(j=1;j<=6;j++)if(i>=a%4+2&&j<=b&&(i+j)%2===0){total++;if(i%2===1&&j%2===1)n++;}return n/total;}for(i=0;i<Math.pow(2,a);i++){var bits=i,count=0;while(bits){count+=bits&1;bits>>>=1;}if(count===2)n++;}return n/Math.pow(2,a);}
    if(t===14)return k===0?10*(a+c)-10*a:k===1?(a-Math.min(a,b,c-1))+(b-Math.min(a,b,c-1))+(c-Math.min(a,b,c-1)):Math.pow(2,a)/4;
    throw new Error('No independent solver');
  }
  function params(topic,r){var t=topics.indexOf(topic),a=3+r(5),b=2+r(5),c=2+r(6);if(t===11){a=1+r(6);b=1+r(8);}if(t===12||t===13){a=3+r(5);b=2+r(4);}return[a,b,c];}
  function render(spec){var item=make(spec.topic,spec.kind,spec.p),v=item.value;
    var vals=[v,v+spec.delta,v-spec.delta,v+2*spec.delta];
    if(spec.topic==='Probability'){var candidates=[0,0.125,0.25,0.375,0.5,0.625,0.75,0.875,1].filter(function(x){return Math.abs(x-v)>0.000001;});vals=[v].concat(candidates.slice(spec.delta%4,spec.delta%4+3));}
    var ordered=spec.order.map(function(i){return vals[i];}),correct=spec.order.indexOf(0);
    return {topic:spec.topic,q:item.q,options:ordered.map(function(x,i){return 'ABCD'[i]+'. '+fmt(x);}),correct:correct,solution:item.solution,sufficiency_check:'The stated counts, domain and relationships determine the requested value without any extra assumptions.',option_check:'Only option '+ 'ABCD'[correct]+' equals the independently calculated value '+fmt(v)+'. The other three distinct values do not satisfy the calculation.',common_mistake:item.insight,concept_check:item.insight,marg_insight:item.insight};
  }
  function create(topic,seed,count){if(topic&&topics.indexOf(topic)<0)throw new Error('Unsupported QA topic: '+topic);count=Number(count)||3;if(count<1||count>22||count%1)throw new Error('Invalid QA count');var r=rng(seed),specs=[],questions=[],offset=r(3),used=new Set();
    for(var i=0;i<count;i++){var t=topic||topics[(r(topics.length)+i)%topics.length],s,q,tries=0;do{var order=[0,1,2,3];for(var j=3;j>0;j--){var swap=r(j+1),tmp=order[j];order[j]=order[swap];order[swap]=tmp;}s={topic:t,kind:(offset+i)%3,p:params(t,r),delta:1+r(9),order:order};q=render(s);if(++tries>100)throw new Error('No fresh distinct QA item');}while(used.has(q.q));used.add(q.q);specs.push(s);questions.push(q);}
    return {difficulty:'Mixed',topics_combined:topic?[topic]:Array.from(new Set(specs.map(function(s){return s.topic;}))),questions:questions,_margQAConstruction:{version:'arithmetic-1',specs:specs}};
  }
  function verify(data,expectedTopic){try{var cert=data&&data._margQAConstruction;if(!cert||cert.version!=='arithmetic-1'||!Array.isArray(cert.specs)||!Array.isArray(data.questions)||data.questions.length!==cert.specs.length)throw Error('Missing QA certificate');
    var keys=[];cert.specs.forEach(function(s,i){if(topics.indexOf(s.topic)<0||![0,1,2].includes(s.kind)||!Array.isArray(s.p)||s.p.length!==3||s.p.some(function(x){return !Number.isInteger(x)||x<1||x>20;})||expectedTopic&&s.topic!==expectedTopic)throw Error('Topic or domain mismatch');if(!Array.isArray(s.order)||s.order.slice().sort().join()!=='0,1,2,3'||!Number.isInteger(s.delta)||s.delta<1||s.delta>9)throw Error('Option contract mismatch');var q=render(s),answer=solve(s);if(!Number.isFinite(answer)||fmt(answer)!==q.options[q.correct].slice(3)||JSON.stringify(q)!==JSON.stringify(data.questions[i])||new Set(q.options.map(function(x){return x.slice(3);})).size!==4)throw Error('Arithmetic or content mismatch');keys.push(q.correct);});
    return {valid:true,issues:[],verification:{answer_indices:keys,answer_explanations:data.questions.map(function(q){return q.solution;}),method:'independent-numeric-code-solver'}};
  }catch(e){return {valid:false,issues:[e.message],failureType:'verification'};}}
  return {topics:topics,create:create,verify:verify};
})();
if(typeof module!=='undefined')module.exports=MargQAEngine;
