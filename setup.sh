JAVA_HOME="/usr/lib/jvm/java-7-openjdk-amd64"
PATH=$JAVA_HOME/bin:$PATH

bash gradlew war

cp uaa/build/libs/cloudfoundry-identity-uaa-1.8.3.war /var/lib/tomcat7/webapps/

cd proxy
npm install --no-bin-links
supervisor proxy.js&
