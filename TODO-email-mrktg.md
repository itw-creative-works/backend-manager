TODO
next, beehiiv has its own unsubscribe link... so the account/email-preferences shit needs some help...

1. if a user gerts a sendgrid email and unsubscirbes, then yes we should unsub them from beehiiv (sync)
2. however, since beehiiv unsub is hosted on their own platform, we need to




APOLLO

i want to build a new segment of the "marketing" section of BEM. curently we have beehiiv and sendgrid for marketing emails. i want to build a new one: apollo (possibly in conjuction with snov.io) for outbound contacting. basiclly each brand would define a seciton of the config for enabling this and what to search for and then we would use an API to get leads. like i said im planning on using apollo. does apollo and/or snov.io have an API? if so, cna you confirm its available on either the free plan or a basic plan (as opposed to an expensive ass ENTERRPRISE FUCKING PLAN)??? maybe build a small script that we can run to test the fetching of leads and filters etc??



newsletter comments
* make the newsletter should NOT REFERENCE THE SOURCE AT ALL. for example, if the source is daily carnage, DO NOT REFERENCE DAILY CARNAGE IN THE NEWSLETTER. the newsletter should be written as if the source does not exist, and the content is original. if there are exact metrics from the source, they should be included and CITED (at the BOTTOM).

beehiiv comments
* dont forget, this needs to be uplaoded to beehiiv. can we test that? DO NOT SEND, just upload for now
* next, we need to include whatever beehiiv needs for the SPONSORSHIPS + ADS to be filled in. i have zero idea how to do that or what is needed or IF WE EVEN NEED TO DO THAT... you shoudl research what the entails and what the options are so we can be sure to include that. im doning this shit to MAKE MONEY. we NEED TO MAKE FUCKING MOMNEY.
* we could also include our own section for sponsorships. a lot of times, liek for example on somiibo, i will want to include links to shit im working on to drive sales... maybe we could add a special sponsors/sponsorships array that gets inserted in a logical predefined section? like either top/middle/end??? idk??

-----

next, can you please do ALL of the themes yu suggested? one at a time, full run, so we can test the looks!

finally, you should document all this. the entire mjml system, how it works, how to add new themes, hwo to test it, etc. i should be able to open a new claude and ask to test this and it should be able to pull a new source and try it....

next, are any of the surces we used marked as "used"??? we didnt actually send any you know so idk if we need to fix them to be "unclaimed" or whatever???

Next, i think we should upload the HTML to the newsletter GH too with the images so that i can just download themnad upload to beehiiv?? is that a good diea?

------

NEW
if we have to push to test, then we need to just delay for now...i have more shit

random sidenote, to be more inline with other proejcts like UJM BXM EM, can you confirm in ".temp" is root, or in src... i think we mgiht need to move .temp

oh one think  i forgot about... how do we properly insert a beehiiv unsubscribe link??? at the bottom??

finally, are the UTM tags running through our unified UTM tag system that tags all our emails (the one that sendgrid uses???) do you know what im talking about??

----


ok next, 2 seprate things.... i realized we might need to generate some other data for the newsletter i didnt think of.. like subject...? maybe even a raw text version?? idk.. and im also realizing tis super annoying to manualyl uplaod the htl to beehiiv because if you want to put ads in, you have to insert them as blocks and our html is just a giant single block...

so ithnk we should make a plaintetx version?? or maybe markdown???


----

also i realized that the newsletter is making up entirely fake links... why tf is it doing that? i think if it cant get a link from the soruce it should NOT return one. its ok to NOT have one. but we also dont necesarily want to use the original links because it could go to the original writer's content. bt is that good or bad?? idk?

also what d o yoou think about sending an internal email to the brand email if the beehiiv api call fails and then lin to the GH repo exactly to the right path so the user manually uplaod...?
