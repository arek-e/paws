# V1SessionsPostRequestNetwork


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**allow_out** | **List[str]** |  | [optional] [default to []]
**credentials** | [**Dict[str, V1SessionsPostRequestNetworkCredentialsValue]**](V1SessionsPostRequestNetworkCredentialsValue.md) |  | [optional] 

## Example

```python
from paws_client.models.v1_sessions_post_request_network import V1SessionsPostRequestNetwork

# TODO update the JSON string below
json = "{}"
# create an instance of V1SessionsPostRequestNetwork from a JSON string
v1_sessions_post_request_network_instance = V1SessionsPostRequestNetwork.from_json(json)
# print the JSON string representation of the object
print(V1SessionsPostRequestNetwork.to_json())

# convert the object into a dict
v1_sessions_post_request_network_dict = v1_sessions_post_request_network_instance.to_dict()
# create an instance of V1SessionsPostRequestNetwork from a dict
v1_sessions_post_request_network_from_dict = V1SessionsPostRequestNetwork.from_dict(v1_sessions_post_request_network_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


