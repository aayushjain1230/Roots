(function (root) {
  "use strict";
  const VERSION = 1;
  const records = [];
  const add = (id, label, aliases, categories, allergens, extra) => records.push(Object.freeze({
    id, label, aliases: aliases || [], categories: categories || [], allergens: allergens || [],
    sourceDependent: false, possibleSources: [], notes: "", ...(extra || {}),
  }));
  const many = (category, items) => items.forEach(([id, label, aliases, extra]) => add(id, label, aliases, [category], [], extra));

  many("meat", [
    ["beef","Beef",[]],["pork","Pork",[],{categories:["meat","pork"]}],["bacon","Bacon",[],{categories:["meat","pork"]}],["ham","Ham",[],{categories:["meat","pork"]}],
    ["chicken","Chicken",[],{categories:["meat","poultry"]}],["turkey","Turkey",[],{categories:["meat","poultry"]}],["duck","Duck",[],{categories:["meat","poultry"]}],
    ["lamb","Lamb",[]],["mutton","Mutton",[]],["veal","Veal",[]],["sausage","Sausage",[]],["meat","Meat",[]],["meat_stock","Meat Stock",["meat broth"]],
    ["bone_broth","Bone Broth",[]],["lard","Lard",[],{categories:["meat","animal_derived","pork"]}],["tallow","Tallow",[],{categories:["meat","animal_derived"]}],["animal_fat","Animal Fat",[]],
  ]);
  many("fish", [["fish","Fish",[]],["tuna","Tuna",[]],["salmon","Salmon",[]],["anchovy","Anchovy",["anchovies"]],["sardine","Sardine",["sardines"]],["cod","Cod",[]],["fish_oil","Fish Oil",[]],["fish_gelatin","Fish Gelatin",["fish gelatine"],{categories:["fish","animal_derived"]}]]);
  many("shellfish", [["shrimp","Shrimp",["prawn","prawns"]],["crab","Crab",[]],["lobster","Lobster",[]],["crayfish","Crayfish",[]],["shellfish","Shellfish",[]],["oyster","Oyster",["oysters"]],["clam","Clam",["clams"]],["mussel","Mussel",["mussels"]],["scallop","Scallop",["scallops"]]]);
  add("egg","Egg",["eggs","egg white","egg whites","egg yolk","egg yolks","albumen","ovalbumin","egg powder","meringue"],["egg","animal_derived"],["egg"]);
  add("mayonnaise","Mayonnaise",["mayo"],["egg","animal_derived"],["egg"]);
  add("milk","Milk",["milk powder","milk solids","nonfat milk","skim milk"],["dairy","animal_derived"],["milk"]);
  add("whey","Whey",["whey powder","whey protein","whey protein concentrate","whey protein isolate"],["dairy","milk_derivative","animal_derived"],["milk"]);
  add("casein","Casein",["caseinate","sodium caseinate"],["dairy","milk_derivative","animal_derived"],["milk"]);
  many("dairy", [["lactose","Lactose",[]],["butter","Butter",["butterfat"]],["cream","Cream",[]],["cheese","Cheese",[]],["ghee","Ghee",[]],["yogurt","Yogurt",["yoghurt"]],["paneer","Paneer",[]],["buttermilk","Buttermilk",[]]]);
  [["onion","Onion",["onion powder"],["root_vegetable","onion_garlic"]],["garlic","Garlic",["garlic powder"],["root_vegetable","onion_garlic"]],
   ["shallot","Shallot",["shallots"],["root_vegetable","onion_garlic"]],["leek","Leek",["leeks"],["root_vegetable","onion_garlic"]],["chive","Chive",["chives"],["root_vegetable","onion_garlic"]],
   ["potato","Potato",["potatoes"],["root_vegetable"]],["sweet_potato","Sweet Potato",["sweet potatoes"],["root_vegetable"]],["yam","Yam",["yams"],["root_vegetable"]],
   ["carrot","Carrot",["carrots"],["root_vegetable"]],["beet","Beet",["beetroot"],["root_vegetable"]],["radish","Radish",["radishes"],["root_vegetable"]],
   ["turnip","Turnip",["turnips"],["root_vegetable"]],["ginger","Ginger",["ginger root"],["root_vegetable"]],["turmeric_root","Turmeric Root",[],["root_vegetable"]],
   ["tapioca","Tapioca",["cassava"],["root_vegetable","plant_derived"]]].forEach(x=>add(x[0],x[1],x[2],x[3],[]));
  add("honey","Honey",[],["honey","animal_derived"],[]);
  add("mushroom","Mushroom",["mushrooms"],["mushroom"],[]);
  add("gelatin","Gelatin",["gelatine","e441","e 441"],["animal_derived","source_dependent","stabilizer"],[],{sourceDependent:true,possibleSources:["pork","beef","fish"]});
  add("porcine_gelatin","Porcine Gelatin",["pork gelatin","porcine gelatine"],["animal_derived","pork"],[]);
  add("carmine","Carmine",["cochineal","e120","e 120"],["animal_derived","insect_derived","color"],[]);
  add("shellac","Shellac",["confectioner's glaze","confectioners glaze"],["animal_derived","insect_derived"],[]);
  add("isinglass","Isinglass",[],["animal_derived","fish"],[]);
  add("collagen","Collagen",[],["animal_derived"],[]);
  add("animal_rennet","Animal Rennet",[],["animal_derived","enzyme"],[]);
  add("rennet","Rennet",[],["source_dependent","enzyme"],[],{sourceDependent:true,possibleSources:["animal","microbial","plant"]});
  add("pepsin","Pepsin",[],["animal_derived","enzyme"],[]);
  add("glycerin","Glycerin",["glycerine"],["source_dependent","emulsifier"],[],{sourceDependent:true,possibleSources:["plant","animal","synthetic"]});
  add("plant_glycerin","Plant Glycerin",["vegetable glycerin","vegetable glycerine"],["plant_derived","emulsifier"],[]);
  add("mono_diglycerides","Mono- and Diglycerides",["mono and diglycerides","monoglycerides","diglycerides"],["source_dependent","emulsifier"],[],{sourceDependent:true,possibleSources:["plant","animal"]});
  add("natural_flavors","Natural Flavors",["natural flavor","natural flavours","natural flavour"],["ambiguous","source_dependent","flavoring"],[],{sourceDependent:true,possibleSources:["plant","animal","fermentation","alcohol_carrier"]});
  add("artificial_flavors","Artificial Flavors",["artificial flavor","artificial flavours"],["ambiguous","artificial_additive","flavoring"],[]);
  add("enzymes","Enzymes",["enzyme"],["ambiguous","source_dependent","enzyme"],[],{sourceDependent:true});
  add("microbial_enzyme","Microbial Enzyme",["microbial enzymes"],["fermentation"],[]);
  add("cultures","Cultures",["culture"],["fermentation","ambiguous"],[]);
  add("shortening","Shortening",[],["source_dependent"],[],{sourceDependent:true});
  add("vitamin_d3","Vitamin D3",["cholecalciferol"],["source_dependent"],[],{sourceDependent:true});
  add("l_cysteine","L-Cysteine",["l cysteine","e920","e 920"],["source_dependent"],[],{sourceDependent:true,possibleSources:["human_hair","animal","fermentation","synthetic"]});
  add("modified_food_starch","Modified Food Starch",[],["source_dependent","stabilizer"],[],{sourceDependent:true});
  add("lecithin","Lecithin",[],["source_dependent","emulsifier"],[],{sourceDependent:true});
  add("soy_lecithin","Soy Lecithin",["soya lecithin"],["soy","plant_derived","emulsifier"],["soy"]);
  add("alcohol","Alcohol",["ethyl alcohol","ethanol"],["alcohol"],[]);
  add("wine","Wine",[],["alcohol","grape_product"],[]); add("beer","Beer",[],["alcohol","fermentation","gluten_grain"],[]); add("rum","Rum",[],["alcohol"],[]); add("brandy","Brandy",[],["alcohol","grape_product"],[]);
  add("blood","Blood",["blood plasma"],["blood","animal_derived"],[]);
  [["seasoning","Seasoning",["seasonings"],["ambiguous","flavoring"]],["spices","Spices",["spice"],["ambiguous","flavoring"]],["colors","Colors",["color","colours","colour"],["ambiguous","artificial_additive"]],["stabilizers","Stabilizers",["stabilizer"],["ambiguous","stabilizer"]],["preservatives","Preservatives",["preservative"],["ambiguous","preservative"]],["emulsifier","Emulsifier",["emulsifiers"],["ambiguous","emulsifier"]],["flavoring","Flavoring",["flavouring"],["ambiguous","flavoring"]]].forEach(x=>add(x[0],x[1],x[2],x[3],[]));
  const gluten = [["wheat","Wheat",["wheat flour","durum","semolina","spelt","farina"],["wheat","gluten_grain"]],["barley","Barley",["barley malt","malt extract","malt flavoring"],["barley","gluten_grain"]],["rye","Rye",[],["rye","gluten_grain"]],["triticale","Triticale",[],["gluten_grain"]],["oats","Oats",[],["oats","gluten_grain"]],["certified_gf_oats","Certified Gluten-Free Oats",["certified gluten free oats"],["oats","plant_derived"]],["brewers_yeast","Brewer's Yeast",["brewers yeast"],["fermentation","source_dependent"]]];
  gluten.forEach(x=>add(x[0],x[1],x[2],x[3],x[0]==="wheat"?["wheat"]:[]));
  add("peanut","Peanut",["peanuts","peanut flour","peanut protein","peanut butter","peanut oil","groundnut","groundnuts","groundnut oil","arachis","arachis oil"],["peanut","plant_derived"],["peanut"]);
  [["almond","Almond"],["cashew","Cashew"],["walnut","Walnut"],["pecan","Pecan"],["pistachio","Pistachio"],["hazelnut","Hazelnut"],["macadamia","Macadamia"],["brazil_nut","Brazil Nut"],["chestnut","Chestnut"],["pine_nut","Pine Nut"]].forEach(x=>add(x[0],x[1],x[0]==="hazelnut"?["filbert"]:[],["tree_nut","plant_derived"],["tree_nut"]));
  add("sesame","Sesame",["sesame seed","sesame oil","tahini","benne","gingelly"],["sesame","plant_derived"],["sesame"]);
  add("soy","Soy",["soya","soybean","soybean oil","soy protein","soy isolate","soy flour","tofu","tempeh","edamame","miso"],["soy","plant_derived"],["soy"]);
  [["sugar","Sugar"],["rice","Rice"],["corn","Corn"],["potato_starch","Potato Starch"],["cocoa_butter","Cocoa Butter"],["peanut_butter","Peanut Butter"],["lactic_acid","Lactic Acid"],["quinoa","Quinoa"],["buckwheat","Buckwheat"],["coconut","Coconut"],["nutmeg","Nutmeg"],["eggplant","Eggplant"],["graham_flour","Graham Flour"]].forEach(x=>add(x[0],x[1],[],["plant_derived"],[]));
  add("mustard","Mustard",["mustard seed","mustard powder","mustard oil"],["plant_derived"],[]);

  const OCR_CORRECTIONS = Object.freeze({"garlik":"garlic","onon":"onion","milik":"milk","whev":"whey","sesarne":"sesame","ground nut":"groundnut"});
  const byId = new Map(records.map(r=>[r.id,r]));
  const aliasIndex = new Map();
  records.forEach(r=>[r.label,...r.aliases].forEach(a=>aliasIndex.set(String(a).toLowerCase().replace(/\s+/g," ").trim(),r)));
  root.ROOTS_INGREDIENT_KNOWLEDGE = Object.freeze({version:VERSION,records:Object.freeze(records),byId,aliasIndex,ocrCorrections:OCR_CORRECTIONS});
})(typeof window!=="undefined"?window:globalThis);
