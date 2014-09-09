JAVA_HOME="/usr/lib/jvm/java-7-openjdk-amd64"
PATH=$JAVA_HOME/bin:$PATH

bash gradlew war

sudo rm -R /var/lib/tomcat7/webapps/uaa*
sudo cp uaa/build/libs/cloudfoundry-identity-uaa-1.8.3.war /var/lib/tomcat7/webapps/uaa.war

cd proxy
npm install --no-bin-links
